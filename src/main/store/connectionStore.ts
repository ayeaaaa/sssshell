import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { ConnectionConfig, Tag } from '@shared/types'

const DEFAULT_TAG_COLOR = '#3d9be9'
const STORE_VERSION = 2

interface StoreFile {
  version?: number
  tags?: Tag[]
  connections?: ConnectionConfig[]
}

/**
 * 连接配置 + 标签的本地持久化。
 *
 * TODO: 密码目前是明文存储，后续接入 Electron 的 safeStorage
 * （Windows 上走 DPAPI）加密 password / privateKeyPassphrase 字段。
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

  exportAll(): string {
    return JSON.stringify(
      { version: STORE_VERSION, tags: this.tags, connections: this.connections },
      null,
      2
    )
  }

  /** 从 JSON 文本导入，按 id 去重后合并；返回导入的连接条数 */
  importAll(json: string): number {
    const parsed = JSON.parse(json) as StoreFile
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
        ...item,
        id: item.id ?? randomUUID(),
        tags: this.normalizeTagIds(item.tags ?? [])
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

  private load(): void {
    try {
      if (!existsSync(this.file)) return
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoreFile

      this.tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is Tag => Boolean(t?.id && t?.name))
        : []

      this.connections = Array.isArray(parsed.connections)
        ? parsed.connections.map((c) => ({
            ...c,
            tags: this.normalizeTagIds(Array.isArray(c.tags) ? c.tags : [])
          }))
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
      JSON.stringify({ version: STORE_VERSION, tags: this.tags, connections: this.connections }, null, 2),
      'utf8'
    )
  }
}
