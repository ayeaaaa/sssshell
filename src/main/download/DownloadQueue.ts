/**
 * 下载任务的并发调度：最多同时跑 limit 个，其余按入队顺序等待。
 */
export class DownloadQueue {
  private readonly limit: number
  private readonly start: (id: string) => void
  private readonly active = new Set<string>()
  private readonly waiting: string[] = []

  constructor(limit: number, start: (id: string) => void) {
    this.limit = Math.max(1, limit)
    this.start = start
  }

  enqueue(id: string): void {
    if (this.active.has(id) || this.waiting.includes(id)) return

    if (this.active.size < this.limit) {
      this.active.add(id)
      this.start(id)
    } else {
      this.waiting.push(id)
    }
  }

  /** 任务结束（完成 / 失败 / 暂停 / 取消）后释放槽位 */
  release(id: string): void {
    if (!this.active.delete(id)) return
    this.pump()
  }

  /** 从队列里彻底移除（不触发启动） */
  remove(id: string): void {
    const index = this.waiting.indexOf(id)
    if (index >= 0) {
      this.waiting.splice(index, 1)
      return
    }
    if (this.active.delete(id)) this.pump()
  }

  get activeIds(): string[] {
    return [...this.active]
  }

  get waitingIds(): string[] {
    return [...this.waiting]
  }

  private pump(): void {
    while (this.active.size < this.limit && this.waiting.length > 0) {
      const next = this.waiting.shift()
      if (!next) return
      this.active.add(next)
      this.start(next)
    }
  }
}
