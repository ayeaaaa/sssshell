import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DownloadStatus, DownloadTask } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { formatBytes, formatRate } from '@renderer/utils/format'

type Filter = 'all' | 'active' | 'done' | 'failed'

const STATUS_LABEL: Record<DownloadStatus, string> = {
  queued: '排队中',
  running: '下载中',
  paused: '已暂停',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}

const STATUS_CLASS: Record<DownloadStatus, string> = {
  queued: 'text-shell-300 bg-shell-600',
  running: 'text-accent-400 bg-accent-600/20',
  paused: 'text-warn bg-warn/15',
  done: 'text-ok bg-ok/15',
  error: 'text-danger bg-danger/15',
  canceled: 'text-shell-400 bg-shell-600'
}

const FILTERS: Array<[Filter, string]> = [
  ['all', '全部'],
  ['active', '进行中'],
  ['done', '已完成'],
  ['failed', '失败']
]

function matches(task: DownloadTask, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return task.status === 'queued' || task.status === 'running' || task.status === 'paused'
  if (filter === 'done') return task.status === 'done'
  return task.status === 'error' || task.status === 'canceled'
}

/** 下载管理器：任务列表、进度、暂停/续传、历史 */
export function DownloadPanel() {
  const downloads = useAppStore((s) => s.downloads)
  const [filter, setFilter] = useState<Filter>('all')

  const visible = useMemo(() => downloads.filter((task) => matches(task, filter)), [downloads, filter])

  const activeCount = downloads.filter(
    (task) => task.status === 'running' || task.status === 'queued'
  ).length
  const finishedCount = downloads.filter(
    (task) => task.status === 'done' || task.status === 'canceled'
  ).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        {FILTERS.map(([key, label]) => {
          const count = downloads.filter((task) => matches(task, key)).length
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                filter === key
                  ? 'bg-accent-600 text-white'
                  : 'text-shell-300 hover:bg-shell-700 hover:text-shell-200'
              }`}
            >
              {label}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          )
        })}

        <span className="ml-auto text-[11px] text-shell-400">
          {activeCount > 0 ? `${activeCount} 个进行中` : '没有进行中的任务'}
        </span>
        <button
          type="button"
          disabled={finishedCount === 0}
          onClick={() => {
            if (window.confirm(`清空 ${finishedCount} 条已完成 / 已取消的记录？`)) {
              void window.api.downloads.clearFinished()
            }
          }}
          className="ml-2 rounded border border-shell-600 px-2 py-0.5 text-[11px] text-shell-300 transition-colors hover:border-danger hover:text-danger disabled:cursor-default disabled:opacity-40 disabled:hover:border-shell-600 disabled:hover:text-shell-300"
        >
          清空记录
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-shell-400">
            {downloads.length === 0
              ? '还没有下载任务，在「文件」面板里点文件的下载按钮即可加入队列'
              : '这个分类下没有任务'}
          </p>
        )}

        {visible.map((task) => (
          <DownloadRow key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}

function DownloadRow({ task }: { task: DownloadTask }) {
  const percent =
    task.status === 'done'
      ? 100
      : task.size > 0
        ? Math.min(100, Math.round((task.transferred / task.size) * 100))
        : 0

  return (
    <div className="group flex items-start gap-3 border-b border-shell-700/40 px-3 py-1.5 hover:bg-shell-700/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] text-shell-200">{task.name}</span>
          <span
            className={`shrink-0 rounded px-1 py-px text-[10px] ${STATUS_CLASS[task.status]}`}
          >
            {STATUS_LABEL[task.status]}
          </span>

          <span className="ml-auto shrink-0 font-mono text-[11px] text-shell-400">
            {formatBytes(task.transferred)}
            {task.size > 0 ? ` / ${formatBytes(task.size)}` : ''}
          </span>
          {task.status === 'running' && (
            <span className="w-16 shrink-0 text-right font-mono text-[11px] text-accent-400">
              {formatRate(task.speed)}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-shell-600">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                task.status === 'error'
                  ? 'bg-danger'
                  : task.status === 'done'
                    ? 'bg-ok'
                    : 'bg-accent-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[10px] text-shell-400">{percent}%</span>
        </div>

        <div className="mt-0.5 truncate text-[10px] text-shell-400" title={task.localPath}>
          {task.sessionLabel}:{task.remotePath} → {task.localPath}
        </div>

        {task.error && <div className="mt-0.5 text-[10px] text-danger">{task.error}</div>}
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {task.status === 'running' && (
          <RowButton onClick={() => void window.api.downloads.pause(task.id)}>暂停</RowButton>
        )}
        {task.status === 'queued' && (
          <RowButton onClick={() => void window.api.downloads.pause(task.id)}>暂停</RowButton>
        )}
        {task.status === 'paused' && (
          <RowButton onClick={() => void window.api.downloads.resume(task.id)}>继续</RowButton>
        )}
        {(task.status === 'error' || task.status === 'canceled') && (
          <RowButton onClick={() => void window.api.downloads.retry(task.id)}>重试</RowButton>
        )}
        {task.status === 'done' && (
          <RowButton onClick={() => void window.api.downloads.openFolder(task.id)}>打开</RowButton>
        )}

        {(task.status === 'running' || task.status === 'queued' || task.status === 'paused') && (
          <RowButton
            danger
            onClick={() => {
              if (window.confirm(`取消下载「${task.name}」？本地未完成的文件会被删除。`)) {
                void window.api.downloads.cancel(task.id)
              }
            }}
          >
            取消
          </RowButton>
        )}

        {task.status !== 'running' && task.status !== 'queued' && (
          <RowButton danger onClick={() => void window.api.downloads.remove(task.id)}>
            删除
          </RowButton>
        )}
      </div>
    </div>
  )
}

function RowButton({
  children,
  onClick,
  danger
}: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
        danger
          ? 'border-transparent text-shell-400 hover:border-danger hover:text-danger'
          : 'border-transparent text-shell-300 hover:border-shell-500 hover:text-shell-200'
      }`}
    >
      {children}
    </button>
  )
}
