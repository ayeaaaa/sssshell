import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { CommandHistoryEntry, CommandRecord } from '@shared/types'

/** 历史最多保留的条数，超出后丢掉最旧的 */
const MAX_ENTRIES = 500

interface StoreFile {
  version?: number
  entries?: CommandHistoryEntry[]
}

/**
 * 命令历史持久化。
 * 记录动作发生在主进程（SshSession 解析终端输入），渲染进程只负责展示。
 */
export class HistoryStore {
  private readonly file: string
  private entries: CommandHistoryEntry[] = []

  constructor(file?: string) {
    this.file = file ?? join(app.getPath('userData'), 'command-history.json')
    this.load()
  }

  list(): CommandHistoryEntry[] {
    return this.entries
  }

  add(record: CommandRecord): CommandHistoryEntry {
    const now = Date.now()
    const head = this.entries[0]

    // 连续执行同一条命令（同一台机器）时只更新时间，不重复占位置
    if (head && head.command === record.command && head.host === record.host) {
      head.executedAt = now
      head.username = record.username
      head.source = record.source
      this.persist()
      return head
    }

    const entry: CommandHistoryEntry = {
      id: randomUUID(),
      command: record.command,
      host: record.host,
      username: record.username,
      source: record.source,
      executedAt: now
    }

    this.entries.unshift(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES
    this.persist()
    return entry
  }

  remove(id: string): boolean {
    const before = this.entries.length
    this.entries = this.entries.filter((entry) => entry.id !== id)
    if (this.entries.length === before) return false
    this.persist()
    return true
  }

  clear(): boolean {
    if (this.entries.length === 0) return false
    this.entries = []
    this.persist()
    return true
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoreFile
      this.entries = Array.isArray(parsed.entries)
        ? parsed.entries.filter((e): e is CommandHistoryEntry => Boolean(e?.id && e?.command))
        : []
    } catch {
      this.entries = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ version: 1, entries: this.entries }, null, 2), 'utf8')
  }
}
