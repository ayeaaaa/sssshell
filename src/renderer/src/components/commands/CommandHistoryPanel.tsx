import { useMemo, useState } from 'react'
import type { CommandHistoryEntry } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { focusTerminal } from '../terminal/terminalRegistry'

interface Props {
  sessionId: string
  connected: boolean
}

/** 命令历史：主进程识别出的完整命令行，点一下重新执行 */
export function CommandHistoryPanel({ sessionId, connected }: Props) {
  const history = useAppStore((s) => s.history)
  const removeHistory = useAppStore((s) => s.removeHistory)
  const clearHistory = useAppStore((s) => s.clearHistory)
  const [keyword, setKeyword] = useState('')
  const [sentId, setSentId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const lower = keyword.trim().toLowerCase()
    if (!lower) return history
    return history.filter(
      (entry) =>
        entry.command.toLowerCase().includes(lower) ||
        entry.host.toLowerCase().includes(lower) ||
        entry.username.toLowerCase().includes(lower)
    )
  }, [history, keyword])

  const rerun = (entry: CommandHistoryEntry): void => {
    if (!connected) return
    window.api.ssh.write(sessionId, `${entry.command}\r`, 'quick')
    focusTerminal(sessionId)
    setSentId(entry.id)
    window.setTimeout(() => setSentId((prev) => (prev === entry.id ? null : prev)), 700)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-2 py-1.5">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索命令 / 主机…"
          className="h-6 w-52 rounded border border-shell-600 bg-shell-900 px-2 text-[11px] text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none"
        />
        <button
          type="button"
          disabled={history.length === 0}
          onClick={() => {
            if (window.confirm(`清空全部 ${history.length} 条命令历史？`)) void clearHistory()
          }}
          className="h-6 shrink-0 rounded border border-shell-600 px-2 text-[11px] text-shell-300 transition-colors hover:border-danger hover:text-danger disabled:cursor-default disabled:opacity-40 disabled:hover:border-shell-600 disabled:hover:text-shell-300"
        >
          清空
        </button>
        <span className="ml-auto shrink-0 text-[11px] text-shell-400">
          共 {history.length} 条 · 点击重新执行
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-[12px] leading-relaxed text-shell-400">
            {history.length === 0
              ? '还没有历史记录，在终端里敲过的命令会自动出现在这里'
              : '没有匹配的记录'}
          </p>
        )}

        {filtered.map((entry) => (
          <div
            key={entry.id}
            className={`group flex items-center gap-2 border-b border-shell-700/40 px-3 py-1 transition-colors hover:bg-shell-700/40 ${
              sentId === entry.id ? 'bg-ok/10' : ''
            } ${connected ? '' : 'opacity-60'}`}
          >
            <span className="w-3 shrink-0 font-mono text-[11px] text-shell-400">$</span>
            <button
              type="button"
              onClick={() => rerun(entry)}
              disabled={!connected}
              title={connected ? '点击重新执行' : '会话未就绪'}
              className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-shell-200"
            >
              {entry.command}
            </button>

            {entry.source === 'quick' && (
              <span className="shrink-0 rounded bg-shell-600 px-1 py-px text-[10px] text-shell-300">
                快捷
              </span>
            )}

            <span className="w-[150px] shrink-0 truncate text-right text-[11px] text-shell-400">
              {entry.username}@{entry.host}
            </span>
            <span className="w-[86px] shrink-0 text-right text-[11px] text-shell-400">
              {formatTime(entry.executedAt)}
            </span>

            <button
              type="button"
              title="从历史中删除"
              onClick={() => void removeHistory(entry.id)}
              className="h-5 w-5 shrink-0 rounded text-shell-400 opacity-0 transition-opacity hover:bg-shell-600 hover:text-danger group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`

  const date = new Date(timestamp)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
