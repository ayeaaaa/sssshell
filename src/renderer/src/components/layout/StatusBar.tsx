import { useAppStore } from '@renderer/store/useAppStore'
import { formatPercent, formatRate } from '@renderer/utils/format'

const stateText = {
  connecting: '连接中…',
  ready: '已连接',
  closed: '已断开',
  error: '连接失败'
} as const

export function StatusBar() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const rightPanel = useAppStore((s) => s.rightPanel)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const setRightPanel = useAppStore((s) => s.setRightPanel)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)

  const tab = tabs.find((t) => t.id === activeTabId)
  const sample = useAppStore((s) => (activeTabId ? s.samples[activeTabId]?.at(-1) : undefined))

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-shell-700 bg-shell-950 px-3 text-[11px] text-shell-400">
      <div className="flex min-w-0 items-center gap-3">
        {tab ? (
          <>
            <span className="text-shell-300">{stateText[tab.state]}</span>
            <span className="truncate font-mono">
              {tab.username}@{tab.host}
            </span>
            {tab.message && <span className="truncate text-danger">{tab.message}</span>}
          </>
        ) : (
          <span>未连接</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {sample && (
          <>
            <span>CPU {formatPercent(sample.cpuUsage)}</span>
            <span>↑ {formatRate(sample.netTxRate)}</span>
            <span>↓ {formatRate(sample.netRxRate)}</span>
          </>
        )}
        {tab && (
          <>
            <button
              type="button"
              onClick={() => setRightPanel('monitor')}
              className={rightPanel === 'monitor' && rightPanelOpen ? 'text-accent-400' : 'hover:text-shell-200'}
            >
              监控
            </button>
            <button
              type="button"
              onClick={() => setRightPanel('sftp')}
              className={rightPanel === 'sftp' && rightPanelOpen ? 'text-accent-400' : 'hover:text-shell-200'}
            >
              文件
            </button>
            <button
              type="button"
              onClick={() => setRightPanel('commands')}
              className={rightPanel === 'commands' && rightPanelOpen ? 'text-accent-400' : 'hover:text-shell-200'}
            >
              命令
            </button>
            <button type="button" onClick={toggleRightPanel} className="hover:text-shell-200">
              {rightPanelOpen ? '收起面板' : '展开面板'}
            </button>
          </>
        )}
      </div>
    </footer>
  )
}
