import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { QuickCommand } from '@shared/types'
import { mergeById } from '../sync/merge'

/** 首次使用时预置的常用命令，用户可自行删改 */
const SEED: Array<Pick<QuickCommand, 'name' | 'command' | 'autoRun'>> = [
  { name: '磁盘占用', command: 'df -h', autoRun: true },
  { name: '内存占用', command: 'free -m', autoRun: true },
  { name: '系统负载', command: 'uptime', autoRun: true },
  { name: '当前目录大小', command: 'du -sh .', autoRun: true },
  { name: 'CPU 占用前 10', command: 'ps aux --sort=-%cpu | head -n 11', autoRun: true },
  { name: '系统信息', command: 'uname -a', autoRun: true }
]

interface StoreFile {
  version?: number
  commands?: QuickCommand[]
}

/**
 * 快捷命令的本地持久化。
 * 与连接配置分开存放：快捷命令是全局的，不跟某台服务器绑定。
 */
export class CommandStore {
  private readonly file: string
  private commands: QuickCommand[] = []

  constructor(file?: string) {
    this.file = file ?? join(app.getPath('userData'), 'quick-commands.json')
    this.load()
  }

  list(): QuickCommand[] {
    return this.commands
  }

  save(input: Partial<QuickCommand> & Pick<QuickCommand, 'name' | 'command'>): QuickCommand {
    const now = Date.now()
    const existing = input.id ? this.commands.find((c) => c.id === input.id) : undefined

    if (existing) {
      existing.name = input.name
      existing.command = input.command
      existing.autoRun = input.autoRun ?? existing.autoRun
      existing.updatedAt = now
      this.persist()
      return existing
    }

    const created: QuickCommand = {
      id: input.id ?? randomUUID(),
      name: input.name,
      command: input.command,
      autoRun: input.autoRun ?? true,
      createdAt: now,
      updatedAt: now
    }

    this.commands.push(created)
    this.persist()
    return created
  }

  delete(id: string): boolean {
    const before = this.commands.length
    this.commands = this.commands.filter((c) => c.id !== id)
    if (this.commands.length === before) return false
    this.persist()
    return true
  }

  /** 同步恢复：按 id 合并快捷命令，远端同 id 覆盖本地 */
  mergeBackup(commands: QuickCommand[]): number {
    this.commands = mergeById(
      this.commands,
      commands.filter((command) => Boolean(command?.id && command?.name && command?.command))
    )
    this.persist()
    return this.commands.length
  }

  private load(): void {
    if (!existsSync(this.file)) {
      this.seed()
      return
    }

    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoreFile
      this.commands = Array.isArray(parsed.commands)
        ? parsed.commands.filter((c): c is QuickCommand => Boolean(c?.id && c?.name && c?.command))
        : []
    } catch {
      this.commands = []
    }
  }

  private seed(): void {
    const now = Date.now()
    this.commands = SEED.map((item) => ({
      ...item,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }))
    this.persist()
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ version: 1, commands: this.commands }, null, 2), 'utf8')
  }
}
