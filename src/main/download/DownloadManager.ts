import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { WriteStream } from 'node:fs'
import type { Readable } from 'node:stream'
import { basename, dirname, join } from 'node:path'
import { app, shell } from 'electron'
import type { DownloadTask } from '@shared/types'
import type { SessionManager } from '../ssh/SessionManager'
import { DownloadQueue } from './DownloadQueue'
import { uniquePath } from './pathUtils'

/** 同时下载的任务数 */
const CONCURRENCY = 2
/** 历史记录上限（已完成 / 已取消 / 失败的记录） */
const MAX_TASKS = 100

export interface AddDownloadInput {
  sessionId: string
  sessionLabel: string
  remotePath: string
  localDir: string
  size: number
}

interface StreamPair {
  read: Readable
  write: WriteStream
}

/**
 * 下载管理器：队列、进度、暂停/续传、历史记录。
 * 进度通过 emit 回调推给渲染进程，状态变化才落盘。
 */
export class DownloadManager {
  private readonly tasks = new Map<string, DownloadTask>()
  private readonly streams = new Map<string, StreamPair>()
  private readonly queue: DownloadQueue
  private readonly file: string | null
  private readonly lastEmit = new Map<string, number>()
  private readonly speedSample = new Map<string, { bytes: number; at: number }>()

  constructor(
    private readonly sessions: SessionManager,
    private readonly emit: (task: DownloadTask) => void,
    file?: string | null
  ) {
    this.queue = new DownloadQueue(CONCURRENCY, (id) => void this.start(id))
    this.file = file === null ? null : (file ?? join(app.getPath('userData'), 'downloads.json'))
    this.load()
  }

  list(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  add(input: AddDownloadInput): DownloadTask {
    const name = basename(input.remotePath)
    mkdirSync(input.localDir, { recursive: true })

    const now = Date.now()
    const task: DownloadTask = {
      id: randomUUID(),
      sessionId: input.sessionId,
      sessionLabel: input.sessionLabel,
      remotePath: input.remotePath,
      localPath: uniquePath(input.localDir, name, existsSync),
      name,
      size: input.size,
      transferred: 0,
      speed: 0,
      status: 'queued',
      createdAt: now,
      updatedAt: now
    }

    this.tasks.set(task.id, task)
    this.trimHistory()
    this.emitTask(task)
    this.persist()
    this.queue.enqueue(task.id)
    return task
  }

  /** 目录下载：建好本地根目录，把目录里每个文件都排进队列 */
  addDirectory(input: {
    sessionId: string
    sessionLabel: string
    remotePath: string
    localDir: string
    files: Array<{ remotePath: string; relativePath: string; size: number }>
  }): DownloadTask[] {
    if (input.files.length > 1000) {
      throw new Error(`目录里有 ${input.files.length} 个文件，超过单次 1000 个的限制`)
    }

    const root = uniquePath(input.localDir, basename(input.remotePath), existsSync)
    mkdirSync(root, { recursive: true })

    return input.files.map((file) =>
      this.add({
        sessionId: input.sessionId,
        sessionLabel: input.sessionLabel,
        remotePath: file.remotePath,
        localDir: join(root, dirname(file.relativePath)),
        size: file.size
      })
    )
  }

  pause(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return

    if (task.status === 'queued') {
      this.queue.remove(id)
    } else if (task.status === 'running') {
      this.queue.release(id)
    } else {
      return
    }

    this.destroyStreams(id)
    task.status = 'paused'
    task.speed = 0
    task.transferred = this.localSize(task.localPath)
    task.updatedAt = Date.now()
    this.emitTask(task)
    this.persist()
  }

  resume(id: string): void {
    const task = this.tasks.get(id)
    if (!task || (task.status !== 'paused' && task.status !== 'error')) return

    task.status = 'queued'
    task.error = undefined
    task.updatedAt = Date.now()
    this.emitTask(task)
    this.persist()
    this.queue.enqueue(id)
  }

  cancel(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    if (task.status === 'done' || task.status === 'canceled') return

    this.queue.remove(id)
    this.destroyStreams(id)

    // 取消就删掉本地半截文件，不留垃圾
    try {
      if (existsSync(task.localPath)) unlinkSync(task.localPath)
    } catch {
      /* 删不掉就算了，记录里已经标成已取消 */
    }

    task.status = 'canceled'
    task.speed = 0
    task.transferred = 0
    task.updatedAt = Date.now()
    this.emitTask(task)
    this.persist()
  }

  retry(id: string): void {
    const task = this.tasks.get(id)
    if (!task || (task.status !== 'error' && task.status !== 'canceled')) return

    // 失败时磁盘上可能还有半截文件，start() 会从实际大小续传
    task.status = 'queued'
    task.error = undefined
    task.updatedAt = Date.now()
    this.emitTask(task)
    this.persist()
    this.queue.enqueue(id)
  }

  remove(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false
    if (task.status === 'running' || task.status === 'queued') return false

    this.tasks.delete(id)
    this.lastEmit.delete(id)
    this.speedSample.delete(id)
    this.persist()
    return true
  }

  /** 清掉已完成 / 已取消的记录，返回被清掉的 id */
  clearFinished(): string[] {
    const removed: string[] = []
    for (const task of this.tasks.values()) {
      if (task.status === 'done' || task.status === 'canceled') {
        this.tasks.delete(task.id)
        removed.push(task.id)
      }
    }
    if (removed.length > 0) this.persist()
    return removed
  }

  openFolder(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    if (existsSync(task.localPath)) shell.showItemInFolder(task.localPath)
    else shell.openPath(task.localPath.replace(/[\\/][^\\/]+$/, ''))
  }

  /** 应用退出前把运行中的任务标记为已暂停，下次可以续传 */
  shutdown(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'running' || task.status === 'queued') {
        this.destroyStreams(task.id)
        task.status = 'paused'
        task.speed = 0
        task.transferred = this.localSize(task.localPath)
        task.updatedAt = Date.now()
      }
    }
    this.persist()
  }

  // ---------- 内部 ----------

  private async start(id: string): Promise<void> {
    const task = this.tasks.get(id)
    if (!task || task.status !== 'queued') {
      this.queue.release(id)
      return
    }

    const session = this.sessions.get(task.sessionId)
    if (!session) {
      this.fail(task, new Error('会话已断开，请重新连接后再试'))
      return
    }

    // 断点续传：以磁盘上实际已有的字节为准
    const offset = this.localSize(task.localPath)
    task.transferred = offset
    task.status = 'running'
    task.error = undefined
    task.updatedAt = Date.now()
    this.speedSample.set(task.id, { bytes: offset, at: Date.now() })
    this.emitTask(task)
    this.persist()

    try {
      const sftp = await session.getSftp()
      const read = sftp.createReadStream(task.remotePath, { start: offset })
      const write = createWriteStream(task.localPath, { flags: offset > 0 ? 'a' : 'w' })
      this.streams.set(task.id, { read, write })

      read.on('data', (chunk: Buffer) => {
        task.transferred += chunk.length
        task.updatedAt = Date.now()
        this.updateSpeed(task)
        this.emitThrottled(task)
      })
      read.on('error', (error: Error) => this.fail(task, error))
      write.on('error', (error: Error) => this.fail(task, error))
      write.on('finish', () => this.complete(task))

      read.pipe(write)
    } catch (error) {
      this.fail(task, error)
    }
  }

  private complete(task: DownloadTask): void {
    if (task.status !== 'running') return

    task.status = 'done'
    task.speed = 0
    task.transferred = this.localSize(task.localPath)
    if (task.size <= 0) task.size = task.transferred
    task.updatedAt = Date.now()

    this.streams.delete(task.id)
    this.speedSample.delete(task.id)
    this.queue.release(task.id)
    this.emitTask(task)
    this.persist()
  }

  private fail(task: DownloadTask, error: unknown): void {
    if (task.status !== 'running' && task.status !== 'queued') return

    this.destroyStreams(task.id)
    task.status = 'error'
    task.speed = 0
    task.error = error instanceof Error ? error.message : String(error)
    task.transferred = this.localSize(task.localPath)
    task.updatedAt = Date.now()

    this.speedSample.delete(task.id)
    this.queue.release(task.id)
    this.emitTask(task)
    this.persist()
  }

  private destroyStreams(id: string): void {
    const pair = this.streams.get(id)
    if (!pair) return
    this.streams.delete(id)
    pair.read.unpipe(pair.write)
    pair.read.destroy()
    pair.write.destroy()
  }

  private localSize(path: string): number {
    try {
      return existsSync(path) ? statSync(path).size : 0
    } catch {
      return 0
    }
  }

  private updateSpeed(task: DownloadTask): void {
    const sample = this.speedSample.get(task.id)
    const now = Date.now()
    if (!sample) {
      this.speedSample.set(task.id, { bytes: task.transferred, at: now })
      return
    }

    const elapsed = (now - sample.at) / 1000
    if (elapsed < 0.5) return

    task.speed = Math.max(0, (task.transferred - sample.bytes) / elapsed)
    this.speedSample.set(task.id, { bytes: task.transferred, at: now })
  }

  private emitThrottled(task: DownloadTask): void {
    const now = Date.now()
    const last = this.lastEmit.get(task.id) ?? 0
    if (now - last < 200) return
    this.lastEmit.set(task.id, now)
    this.emitTask(task)
  }

  private emitTask(task: DownloadTask): void {
    this.lastEmit.set(task.id, Date.now())
    this.emit({ ...task })
  }

  private trimHistory(): void {
    if (this.tasks.size <= MAX_TASKS) return
    const finished = [...this.tasks.values()]
      .filter((task) => task.status === 'done' || task.status === 'canceled' || task.status === 'error')
      .sort((a, b) => a.createdAt - b.createdAt)

    while (this.tasks.size > MAX_TASKS && finished.length > 0) {
      const oldest = finished.shift()
      if (oldest) this.tasks.delete(oldest.id)
    }
  }

  private load(): void {
    if (!this.file) return
    try {
      if (!existsSync(this.file)) return
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { tasks?: DownloadTask[] }
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []

      for (const task of tasks) {
        if (!task?.id || !task.localPath) continue
        // 重启后不可能还在传，统一标成已暂停，等用户点继续
        if (task.status === 'running' || task.status === 'queued') {
          task.status = 'paused'
          task.speed = 0
          task.transferred = this.localSize(task.localPath)
        }
        this.tasks.set(task.id, task)
      }
    } catch {
      this.tasks.clear()
    }
  }

  private persist(): void {
    if (!this.file) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify({ version: 1, tasks: this.list() }, null, 2), 'utf8')
    } catch {
      /* 落盘失败不影响正在进行的下载 */
    }
  }
}
