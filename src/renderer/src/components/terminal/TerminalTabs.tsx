import type { SshSessionState } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import type { TerminalTab } from '@renderer/store/useAppStore'

const stateColor: Record<SshSessionState, string> = {
  connecting: 'bg-warn',
  ready: 'bg-ok',
  closed: 'bg-shell-400',
  error: 'bg-danger'
}

export function TerminalTabs() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="flex h-8 shrink-0 items-stretch gap-px overflow-x-auto border-b border-shell-700 bg-shell-900">
      {tabs.map((tab: TerminalTab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={`group flex max-w-[200px] shrink-0 items-center gap-2 border-r border-shell-700 px-3 text-[12px] ${
              active ? 'bg-shell-800 text-shell-200' : 'text-shell-300 hover:bg-shell-700/60'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex min-w-0 items-center gap-2"
              title={tab.message ?? `${tab.username}@${tab.host}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateColor[tab.state]}`} />
              <span className="truncate">{tab.title}</span>
            </button>
            <button
              type="button"
              title="关闭标签页"
              onClick={() => void closeTab(tab.id)}
              className="shrink-0 text-shell-400 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
