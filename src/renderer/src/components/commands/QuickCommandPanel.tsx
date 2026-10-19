import { useMemo, useState } from 'react'
import type { QuickCommand } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { focusTerminal } from '../terminal/terminalRegistry'
import { CommandDialog } from './CommandDialog'

interface Props {
  sessionId: string
  connected: boolean
}

/** 快捷命令面板：点一下把命令发到当前终端 */
export function QuickCommandPanel({ sessionId, connected }: Props) {
  const commands = useAppStore((s) => s.commands)
  const deleteCommand = useAppStore((s) => s.deleteCommand)
  const [keyword, setKeyword] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; command: QuickCommand | null } | null>(null)
  /** 刚发送的命令，短暂高亮一下作为反馈 */
  const [sentId, setSentId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const lower = keyword.trim().toLowerCase()
    if (!lower) return commands
    return commands.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.command.toLowerCase().includes(lower)
    )
  }, [commands, keyword])

  const send = (command: QuickCommand): void => {
    if (!connected) return
    window.api.ssh.write(sessionId, command.autoRun ? `${command.command}\r` : command.command)
    focusTerminal(sessionId)
    setSentId(command.id)
    window.setTimeout(() => setSentId((prev) => (prev === command.id ? null : prev)), 700)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-shell-700 px-2 py-1.5">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索命令…"
          className="h-6 min-w-0 flex-1 rounded border border-shell-600 bg-shell-900 px-2 text-[11px] text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setDialog({ open: true, command: null })}
          title="新建快捷命令"
          className="h-6 shrink-0 rounded bg-accent-600 px-2 text-[11px] text-white transition-colors hover:bg-accent-500"
        >
          ＋
        </button>
      </div>

      {!connected && (
        <p className="border-b border-shell-700 bg-shell-700/40 px-3 py-1.5 text-[11px] text-shell-400">
          会话就绪后才能发送命令
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-shell-400">
            {commands.length === 0 ? (
              <>
                还没有快捷命令
                <br />
                点右上角 ＋ 添加一条
              </>
            ) : (
              '没有匹配的命令'
            )}
          </p>
        )}

        {filtered.map((command) => (
          <div
            key={command.id}
            className={`group flex items-start gap-2 border-b border-shell-700/50 px-3 py-2 transition-colors hover:bg-shell-700/50 ${
              sentId === command.id ? 'border-l-2 border-l-ok bg-ok/10' : 'border-l-2 border-l-transparent'
            } ${connected ? '' : 'opacity-50'}`}
          >
            <button
              type="button"
              onClick={() => send(command)}
              disabled={!connected}
              title={connected ? '点击发送到当前终端' : '会话未就绪'}
              className="min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12px] text-shell-200">{command.name}</span>
                {!command.autoRun && (
                  <span className="shrink-0 rounded bg-shell-600 px-1 py-px text-[10px] text-shell-300">
                    仅粘贴
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[11px] text-shell-400">
                {command.command}
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                title="编辑"
                onClick={() => setDialog({ open: true, command })}
                className="h-5 w-5 rounded text-shell-300 transition-colors hover:bg-shell-600 hover:text-accent-400"
              >
                ✎
              </button>
              <button
                type="button"
                title="删除"
                onClick={() => {
                  if (window.confirm(`删除快捷命令「${command.name}」？`)) void deleteCommand(command.id)
                }}
                className="h-5 w-5 rounded text-shell-300 transition-colors hover:bg-shell-600 hover:text-danger"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="shrink-0 border-t border-shell-700 px-3 py-1.5 text-[11px] text-shell-400">
        共 {commands.length} 条 · 点击发送到当前终端
      </p>

      {dialog?.open && (
        <CommandDialog editing={dialog.command} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
