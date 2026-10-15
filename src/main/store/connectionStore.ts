import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { ConnectionConfig } from '@shared/types'

/**
 * 连接配置的本地持久化。
 *
 * TODO: 密码目前是明文存储，后续接入 Electron 的 safeStorage
 * （Windows 上走 DPAPI）加密 password / privateKeyPassphrase 字段。
 */
export class ConnectionStore {
  private readonly file: string
  private connections: ConnectionConfig[] = []

  constructor(file?: string) {
    this.file = file ?? join(app.getPath('userData'), 'connections.json')
    this.load()
  }

  list(): ConnectionConfig[] {
    return this.connections
  }

  save(input: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'username'>): ConnectionConfig {
    const now = Date.now()
    const existing = input.id ? this.connections.find((c) => c.id === input.id) : undefined

    if (existing) {
      Object.assign(existing, input, { updatedAt: now })
      this.persist()
      return existing
    }

    const created: ConnectionConfig = {
      id: input.id ?? randomUUID(),
      name: input.name ?? '',
      group: input.group ?? '默认分组',
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

  /** 导出为 JSON 文本 */
  exportAll(): string {
    return JSON.stringify({ version: 1, connections: this.connections }, null, 2)
  }

  /** 从 JSON 文本导入，按 id 去重后合并 */
  importAll(json: string): number {
    const parsed = JSON.parse(json) as { connections?: ConnectionConfig[] }
    const incoming = Array.isArray(parsed.connections) ? parsed.connections : []
    let count = 0

    for (const item of incoming) {
      if (!item?.host || !item?.username) continue
      const exists = item.id && this.connections.some((c) => c.id === item.id)
      if (exists) continue
      this.connections.push({ ...item, id: item.id ?? randomUUID() })
      count += 1
    }

    if (count > 0) this.persist()
    return count
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return
      const raw = readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw) as { connections?: ConnectionConfig[] }
      this.connections = Array.isArray(parsed.connections) ? parsed.connections : []
    } catch {
      this.connections = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ version: 1, connections: this.connections }, null, 2), 'utf8')
  }
}
