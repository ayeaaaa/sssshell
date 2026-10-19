import { useAppStore } from '@renderer/store/useAppStore'
import type { BottomPanelTab } from '@renderer/store/useAppStore'
import { QuickCommandPanel } from '../commands/QuickCommandPanel'
import { CommandHistoryPanel } from '../commands/CommandHistoryPanel'
import { DownloadPanel } from '../downloads/DownloadPanel'

interface Props {
  sessionId: string
  connected: boolean
}

/** 终端下方的命令抽屉：快捷命令 + 命令历史 */
export function BottomPanel({ sessionId, connected }: Props) {
  const tab = useAppStore((s) => s.bottomPanelTab)
  const commandsCount = useAppStore((s) => s.commands.length)
  const historyCount = useAppStore((s) => s.history.length)
  const downloadsCount = useAppStore((s) => s.downloads.length)
  const activeDownloads = useAppStore(
    (s) => s.downloads.filter((task) => task.status === 'running' || task.status === 'queued').length
  )
  const openBottomPanel = useAppStore((s) => s.openBottomPanel)
  const closeBottomPanel = useAppStore((s) => s.closeBottomPanel)

  const tabs: Array<[BottomPanelTab, string, number]> = [
    ['commands', '快捷命令', commandsCount],
    ['history', '命令历史', historyCount],
    ['downloads', '下载', downloadsCount]
  ]

  return (
    <section className="flex h-[224px] shrink-0 flex-col border-t border-shell-700 bg-shell-800">
      <div className="flex shrink-0 items-stretch border-b border-shell-700">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => openBottomPanel(key)}
            className={`border-b-2 px-3 py-1.5 text-[12px] transition-colors ${
              tab === key
                ? 'border-accent-500 text-accent-400'
                : 'border-transparent text-shell-300 hover:text-shell-200'
            }`}
          >
            {label}
            {key === 'downloads' && activeDownloads > 0 && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-ok" title="有任务在下载" />
            )}
            <span className="ml-1 text-[11px] text-shell-400">{count}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={closeBottomPanel}
          title="收起（Ctrl+J）"
          className="ml-auto px-3 text-shell-400 transition-colors hover:text-shell-200"
        >
          ▾
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'commands' ? (
          <QuickCommandPanel sessionId={sessionId} connected={connected} />
        ) : tab === 'history' ? (
          <CommandHistoryPanel sessionId={sessionId} connected={connected} />
        ) : (
          <DownloadPanel />
        )}
      </div>
    </section>
  )
}
