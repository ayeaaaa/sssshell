import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import type {
  BackupPayload,
  SyncDownloadResult,
  SyncResult,
  SyncSettings
} from '@shared/types'
import type { ConnectionStore } from '../store/connectionStore'
import type { CommandStore } from '../store/commandStore'
import { createBackend } from './backends'
import { decryptBackup, encryptBackup } from './crypto'

type StoredBackend = Omit<SyncSettings['backend'], 'password'> & {
  password?: string
  passwordEnc?: string
}

interface StoredSettings {
  backend: StoredBackend
  autoUpload: boolean
  lastSyncAt?: number
}

/**
 * 配置同步：把连接 / 标签 / 快捷命令打包，用主密码加密后传到选定的存储。
 * 主密码只在本次运行内保留，用于自动上传。
 */
export class SyncService {
  private readonly file: string
  private settings: SyncSettings | null = null
  private sessionPassword: string | null = null
  private autoTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly connections: ConnectionStore,
    private readonly commands: CommandStore,
    private readonly emit: (result: SyncResult) => void,
    file?: string
  ) {
    this.file = file ?? join(app.getPath('userData'), 'sync.json')
    this.load()
  }

  getSettings(): SyncSettings | null {
    return this.settings
  }

  saveSettings(settings: SyncSettings): void {
    this.settings = settings
    this.persist()
  }

  async upload(masterPassword: string): Promise<SyncResult> {
    try {
      if (!this.settings) throw new Error('还没有配置同步方式')
      if (!masterPassword) throw new Error('请输入主密码')

      const payload: BackupPayload = {
        version: 1,
        exportedAt: Date.now(),
        connections: this.connections.list(),
        tags: this.connections.listTags(),
        commands: this.commands.list()
      }

      const encrypted = encryptBackup(JSON.stringify(payload), masterPassword)
      await createBackend(this.settings.backend).upload(encrypted)

      this.sessionPassword = masterPassword
      this.settings.lastSyncAt = Date.now()
      this.persist()

      return {
        ok: true,
        message: `已上传：${payload.connections.length} 个连接、${payload.tags.length} 个标签、${payload.commands.length} 条快捷命令`,
        syncedAt: this.settings.lastSyncAt
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  async download(masterPassword: string): Promise<SyncDownloadResult> {
    try {
      if (!this.settings) throw new Error('还没有配置同步方式')
      if (!masterPassword) throw new Error('请输入主密码')

      const encrypted = await createBackend(this.settings.backend).download()
      const payload = JSON.parse(decryptBackup(encrypted, masterPassword)) as BackupPayload

      const merged = this.connections.mergeBackup(payload.tags ?? [], payload.connections ?? [])
      const commandCount = this.commands.mergeBackup(payload.commands ?? [])

      this.sessionPassword = masterPassword
      this.settings.lastSyncAt = Date.now()
      this.persist()

      return {
        ok: true,
        message: `已恢复：${merged.connections} 个连接、${merged.tags} 个标签、${commandCount} 条快捷命令`,
        syncedAt: this.settings.lastSyncAt,
        connections: merged.connections,
        tags: merged.tags,
        commands: commandCount
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        connections: 0,
        tags: 0,
        commands: 0
      }
    }
  }

  /** 配置发生变化时调用；开了自动上传且本次运行输过主密码才会触发 */
  notifyChange(): void {
    if (!this.settings?.autoUpload || !this.sessionPassword) return

    if (this.autoTimer) clearTimeout(this.autoTimer)
    this.autoTimer = setTimeout(() => {
      const password = this.sessionPassword
      if (!password) return
      void this.upload(password).then((result) => this.emit(result))
    }, 3000)
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return

      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoredSettings>
      if (!stored.backend) return

      const { passwordEnc, password, ...rest } = stored.backend
      this.settings = {
        backend: {
          ...rest,
          password: passwordEnc ? this.decrypt(passwordEnc) : password
        },
        autoUpload: Boolean(stored.autoUpload),
        lastSyncAt: stored.lastSyncAt
      }
    } catch {
      this.settings = null
    }
  }

  private persist(): void {
    if (!this.settings) return

    const { password, ...rest } = this.settings.backend
    const stored: StoredSettings = {
      ...this.settings,
      backend: {
        ...rest,
        ...(password ? { passwordEnc: this.encrypt(password) } : {})
      }
    }

    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(stored, null, 2), 'utf8')
  }

  private encrypt(value: string): string | undefined {
    try {
      if (!safeStorage.isEncryptionAvailable()) return undefined
      return safeStorage.encryptString(value).toString('base64')
    } catch {
      return undefined
    }
  }

  private decrypt(value: string): string | undefined {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return undefined
    }
  }
}
