import { useState } from 'react'
import { useAppStore } from '@renderer/store/useAppStore'

/** 批量命令：把一条命令同时发到多个已就绪的会话 */
export function BatchCommandPanel() {
  const tabs = useAppStore((s) => s.tabs)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [command, setCommand] = useState('')
  const [feedback, setFeedback] = useState('')

  const readyTabs = tabs.filter((tab) => tab.state === 'ready')
  const targets = readyTabs.filter((tab) => selected.has(tab.id))

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = (): void => setSelected(new Set(readyTabs.map((tab) => tab.id)))
  const clearSelection = (): void => setSelected(new Set())

  const send = (): void => {
    if (!command.trim() || targets.length === 0) return
    for (const tab of targets) {
      window.api.ssh.write(tab.id, `${command}\r`, 'quick')
    }
    setFeedback(`已发送到 ${targets.length} 个会话`)
    window.setTimeout(() => setFeedback(''), 2000)
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[250px] shrink-0 flex-col border-r border-shell-700">
        <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-shell-400">
          <span>选择目标会话（{readyTabs.length} 个就绪）</span>
          <span className="flex gap-2">
            <button type="button" onClick={selectAll} className="hover:text-shell-200">
              全选
            </button>
            <button type="button" onClick={clearSelection} className="hover:text-shell-200">
              清空
            </button>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {tabs.length === 0 && (
            <p className="py-4 text-center text-[12px] text-shell-400">没有打开的会话</p>
          )}

          {tabs.map((tab) => (
            <label
              key={tab.id}
              className={`flex items-center gap-2 py-0.5 text-[12px] ${
                tab.state === 'ready' ? 'cursor-pointer text-shell-200' : 'cursor-default text-shell-400'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(tab.id)}
                disabled={tab.state !== 'ready'}
                onChange={() => toggle(tab.id)}
                className="accent-accent-500"
              />
              <span className="truncate">{tab.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-shell-400">
                {tab.state === 'ready' ? '' : '未就绪'}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2">
        <textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="要同时下发到多个会话的命令…"
          className="w-full resize-none rounded border border-shell-600 bg-shell-900 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none"
        />

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={send}
            disabled={!command.trim() || targets.length === 0}
            className="rounded bg-accent-600 px-3 py-1 text-[12px] text-white transition-colors hover:bg-accent-500 disabled:cursor-default disabled:opacity-40"
          >
            发送到 {targets.length} 个会话
          </button>
          {feedback && <span className="text-[11px] text-ok">{feedback}</span>}
          <span className="ml-auto text-[11px] text-shell-400">命令会追加回车后发出</span>
        </div>
      </div>
    </div>
  )
}
