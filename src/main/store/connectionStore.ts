import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { ConnectionConfig, Tag } from '@shared/types'
import { mergeById } from '../sync/merge'

const DEFAULT_TAG_COLOR = '#3d9be9'
const STORE_VERSION = 3

/** 落盘时的连接结构：密码用 safeStorage 加密成 base64 */
type StoredConnection = Omit<ConnectionConfig, 'password' | 'privateKeyPassphrase'> & {
  password?: string
  privateKeyPassphrase?: string
  passwordEnc?: string
  privateKeyPassphraseEnc?: string
}

interface StoreFile {
  version?: number
  tags?: Tag[]
  connections?: StoredConnection[]
}

/**
 * 连接配置 + 标签的本地持久化。
 *
 * 密码和私钥口令在落盘前用 Electron safeStorage 加密（Windows 上走 DPAPI）。
 * 内存里始终保持明文，界面和 SSH 连接拿到的都是可直接用的配置。
 */
export class ConnectionStore {
  private readonly file: string
  private connections: ConnectionConfig[] = []
  private tags: Tag[] = []

  constructor(file?: string) {
    this.file = file ?? join(app.getPath('userData'), 'connections.json')
    this.load()
  }

  // ---------- 连接 ----------

  list(): ConnectionConfig[] {
    return this.connections
  }

  save(input: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'username'>): ConnectionConfig {
    const now = Date.now()
    const existing = input.id ? this.connections.find((c) => c.id === input.id) : undefined

    if (existing) {
      Object.assign(existing, input, { updatedAt: now })
      existing.tags = this.normalizeTagIds(input.tags ?? existing.tags)
      this.persist()
      return existing
    }

    const created: ConnectionConfig = {
      id: input.id ?? randomUUID(),
      name: input.name ?? '',
      group: input.group ?? '默认分组',
      tags: this.normalizeTagIds(input.tags ?? []),
      host: input.host,
      port: input.port ?? 22,
      username: input.username,
      authMethod: input.authMethod ?? 'password',
      password: input.password,
      privateKeyPath: input.privateKeyPath,
      privateKeyPassphrase: input.privateKeyPassphrase,
      keepaliveInterval: input.keepaliveInterval ?? 30,
      createdAt: now,
      updatedAt: now
    }

    this.connections.push(created)
    this.persist()
    return created
  }

  delete(id: string): boolean {
    const before = this.connections.length
    this.connections = this.connections.filter((c) => c.id !== id)
    if (this.connections.length === before) return false
    this.persist()
    return true
  }

  /** 同步恢复：按 id 合并标签和连接，远端同 id 覆盖本地 */
  mergeBackup(tags: Tag[], connections: ConnectionConfig[]): { tags: number; connections: number } {
    this.tags = mergeById(
      this.tags,
      tags.filter((tag) => Boolean(tag?.id && tag?.name))
    )

    const normalized = connections
      .filter((config) => Boolean(config?.id && config?.host && config?.username))
      .map((config) => ({
        ...config,
        tags: this.normalizeTagIds(Array.isArray(config.tags) ? config.tags : [])
      }))

    this.connections = mergeById(this.connections, normalized)
    this.persist()

    return { tags: this.tags.length, connections: this.connections.length }
  }

  // ---------- 标签 ----------

  listTags(): Tag[] {
    return this.tags
  }

  saveTag(input: Partial<Tag> & Pick<Tag, 'name'>): Tag {
    const existing = input.id ? this.tags.find((t) => t.id === input.id) : undefined

    if (existing) {
      existing.name = input.name
      if (input.color) existing.color = input.color
      this.persist()
      return existing
    }

    const created: Tag = {
      id: input.id ?? randomUUID(),
      name: input.name,
      color: input.color ?? DEFAULT_TAG_COLOR
    }
    this.tags.push(created)
    this.persist()
    return created
  }

  /** 删除标签，并从所有连接上摘掉该标签 */
  deleteTag(id: string): boolean {
    const before = this.tags.length
    this.tags = this.tags.filter((t) => t.id !== id)
    if (this.tags.length === before) return false

    for (const connection of this.connections) {
      connection.tags = connection.tags.filter((tagId) => tagId !== id)
    }
    this.persist()
    return true
  }

  // ---------- 导入 / 导出 ----------

  /** 导出为明文 JSON（方便换机导入），注意文件里会包含密码 */
  exportAll(): string {
    return JSON.stringify(
      { version: STORE_VERSION, tags: this.tags, connections: this.connections },
      null,
      2
    )
  }

  /** 从 JSON 文本导入，按 id 去重后合并；返回导入的连接条数 */
  importAll(json: string): number {
    const parsed = JSON.parse(json) as { tags?: Tag[]; connections?: Array<Partial<ConnectionConfig>> }
    const incomingTags = Array.isArray(parsed.tags) ? parsed.tags : []
    const incomingConnections = Array.isArray(parsed.connections) ? parsed.connections : []

    for (const tag of incomingTags) {
      if (!tag?.name || this.tags.some((t) => t.id === tag.id)) continue
      this.tags.push({ id: tag.id ?? randomUUID(), name: tag.name, color: tag.color ?? DEFAULT_TAG_COLOR })
    }

    let count = 0
    for (const item of incomingConnections) {
      if (!item?.host || !item?.username) continue
      if (item.id && this.connections.some((c) => c.id === item.id)) continue

      this.connections.push({
        id: item.id ?? randomUUID(),
        name: item.name ?? '',
        group: item.group ?? '默认分组',
        tags: this.normalizeTagIds(item.tags ?? []),
        host: item.host,
        port: item.port ?? 22,
        username: item.username,
        authMethod: item.authMethod ?? 'password',
        password: item.password,
        privateKeyPath: item.privateKeyPath,
        privateKeyPassphrase: item.privateKeyPassphrase,
        keepaliveInterval: item.keepaliveInterval ?? 30,
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: Date.now()
      })
      count += 1
    }

    if (count > 0 || incomingTags.length > 0) this.persist()
    return count
  }

  // ---------- 内部 ----------

  /** 丢掉不存在的标签 ID，避免导入脏数据后筛选出空结果 */
  private normalizeTagIds(ids: string[]): string[] {
    const known = new Set(this.tags.map((t) => t.id))
    return [...new Set(ids.filter((id) => known.has(id)))]
  }

  private encrypt(value: string): string | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.encryptString(value).toString('base64')
    } catch {
      return null
    }
  }

  private decrypt(value: string): string | undefined {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      // 换机器 / 系统账户变化后旧密文解不开，让用户重新输入密码
      return undefined
    }
  }

  private toStored(config: ConnectionConfig): StoredConnection {
    const { password, privateKeyPassphrase, ...rest } = config
    const stored: StoredConnection = { ...rest }

    if (password) {
      const encrypted = this.encrypt(password)
      if (encrypted) stored.passwordEnc = encrypted
      else stored.password = password
    }

    if (privateKeyPassphrase) {
      const encrypted = this.encrypt(privateKeyPassphrase)
      if (encrypted) stored.privateKeyPassphraseEnc = encrypted
      else stored.privateKeyPassphrase = privateKeyPassphrase
    }

    return stored
  }

  private fromStored(stored: StoredConnection): ConnectionConfig {
    const { passwordEnc, privateKeyPassphraseEnc, ...rest } = stored

    return {
      ...rest,
      tags: this.normalizeTagIds(Array.isArray(rest.tags) ? rest.tags : []),
      password: passwordEnc ? this.decrypt(passwordEnc) : stored.password,
      privateKeyPassphrase: privateKeyPassphraseEnc
        ? this.decrypt(privateKeyPassphraseEnc)
        : stored.privateKeyPassphrase
    }
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoreFile

      this.tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is Tag => Boolean(t?.id && t?.name))
        : []

      this.connections = Array.isArray(parsed.connections)
        ? parsed.connections.map((stored) => this.fromStored(stored))
        : []
    } catch {
      this.connections = []
      this.tags = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(
      this.file,
      JSON.stringify(
        {
          version: STORE_VERSION,
          tags: this.tags,
          connections: this.connections.map((config) => this.toStored(config))
        },
        null,
        2
      ),
      'utf8'
    )
  }
}
