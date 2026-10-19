import { describe, expect, it, vi } from 'vitest'
import { DownloadQueue } from './DownloadQueue'

describe('DownloadQueue', () => {
  it('最多同时启动 limit 个任务，其余排队', () => {
    const start = vi.fn()
    const queue = new DownloadQueue(2, start)

    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')

    expect(start.mock.calls.map((call) => call[0])).toEqual(['a', 'b'])
    expect(queue.activeIds).toEqual(['a', 'b'])
    expect(queue.waitingIds).toEqual(['c'])
  })

  it('任务结束后自动补位', () => {
    const start = vi.fn()
    const queue = new DownloadQueue(1, start)

    queue.enqueue('a')
    queue.enqueue('b')
    expect(queue.waitingIds).toEqual(['b'])

    queue.release('a')

    expect(start).toHaveBeenLastCalledWith('b')
    expect(queue.activeIds).toEqual(['b'])
    expect(queue.waitingIds).toEqual([])
  })

  it('重复入队同一任务会被忽略', () => {
    const start = vi.fn()
    const queue = new DownloadQueue(2, start)

    queue.enqueue('a')
    queue.enqueue('a')

    expect(start).toHaveBeenCalledTimes(1)
    expect(queue.activeIds).toEqual(['a'])
  })

  it('移出排队中的任务后不会再启动它', () => {
    const start = vi.fn()
    const queue = new DownloadQueue(1, start)

    queue.enqueue('a')
    queue.enqueue('b')
    queue.remove('b')
    queue.release('a')

    expect(start).toHaveBeenCalledTimes(1)
    expect(queue.waitingIds).toEqual([])
  })

  it('release 未知任务不会误启动下一个', () => {
    const start = vi.fn()
    const queue = new DownloadQueue(1, start)

    queue.enqueue('a')
    queue.enqueue('b')
    queue.release('nope')

    expect(start).toHaveBeenCalledTimes(1)
    expect(queue.waitingIds).toEqual(['b'])
  })
})
