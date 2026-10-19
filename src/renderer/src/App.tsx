import { useEffect, useState } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useAppStore } from './store/useAppStore'
import { TitleBar } from './components/layout/TitleBar'
import { ConnectionSidebar } from './components/layout/ConnectionSidebar'
import { StatusBar } from './components/layout/StatusBar'
import { TerminalTabs } from './components/terminal/TerminalTabs'
import { TerminalPane } from './components/terminal/TerminalPane'
import { writeLocalNotice, writeToTerminal } from './components/terminal/terminalRegistry'
import { ConnectionDialog } from './components/connections/ConnectionDialog'
import { TagManagerDialog } from './components/connections/TagManagerDialog'
import { MonitorPanel } from './components/monitor/MonitorPanel'
import { SftpPanel } from './components/sftp/SftpPanel'
import { BottomPanel } from './components/layout/BottomPanel'
import { EditorDialog } from './components/editor/EditorDialog'

export default function App() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const loadConnections = useAppStore((s) => s.loadConnections)
  const loadTags = useAppStore((s) => s.loadTags)
  const loadCommands = useAppStore((s) => s.loadCommands)
  const loadHistory = useAppStore((s) => s.loadHistory)
  const appendHistory = useAppStore((s) => s.appendHistory)
  const loadDownloads = useAppStore((s) => s.loadDownloads)
  const upsertDownload = useAppStore((s) => s.upsertDownload)
  const removeDownload = useAppStore((s) => s.removeDownload)
  const bottomPanelOpen = useAppStore((s) => s.bottomPanelOpen)
  const updateTabState = useAppStore((s) => s.updateTabState)
  const pushSample = useAppStore((s) => s.pushSample)

  const [dialog, setDialog] = useState<{ open: boolean; editing: ConnectionConfig | null }>({
    open: false,
    editing: null
  })
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  useEffect(() => {
    void loadConnections()
    void loadTags()
    void loadCommands()
    void loadHistory()
    void loadDownloads()
  }, [loadConnections, loadTags, loadCommands, loadHistory, loadDownloads])

  // Ctrl+Tab / Ctrl+Shift+Tab 切换标签，Ctrl+1..9 跳到第 N 个
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return
      const state = useAppStore.getState()

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        event.stopPropagation()
        state.toggleSidebar()
        return
      }

      if (state.tabs.length === 0) return

      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        const index = state.tabs.findIndex((t) => t.id === state.activeTabId)
        const delta = event.shiftKey ? -1 : 1
        const next = (index + delta + state.tabs.length) % state.tabs.length
        state.setActiveTab(state.tabs[next].id)
        return
      }

      if (event.key === '`') {
        event.preventDefault()
        event.stopPropagation()
        state.toggleBottomPanel()
        return
      }

      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault()
        const target = state.tabs[Math.min(Number(event.key) - 1, state.tabs.length - 1)]
        if (target) state.setActiveTab(target.id)
      }
    }

    // 捕获阶段拦截，避免 xterm 先吃掉按键
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  // 全局只订阅一次主进程事件，再分发到各个终端
  useEffect(() => {
    const offData = window.api.ssh.onData(({ sessionId, data }) => writeToTerminal(sessionId, data))

    const offState = window.api.ssh.onState(({ sessionId, state, message }) => {
      updateTabState(sessionId, state, message)
      if (state === 'ready') {
        writeLocalNotice(sessionId, '连接成功，已进入交互式 Shell')
        void window.api.monitor.start(sessionId)
      } else if (state === 'error') {
        writeLocalNotice(sessionId, `连接失败：${message ?? '未知错误'}`, '\x1b[38;2;224;87;79m')
      } else if (state === 'closed') {
        writeLocalNotice(sessionId, '连接已断开')
      }
    })

    const offExit = window.api.ssh.onExit(({ sessionId, code }) => {
      updateTabState(sessionId, 'closed')
      void window.api.monitor.stop(sessionId)
      writeLocalNotice(sessionId, `会话结束${code === null ? '' : `（退出码 ${code}）`}`)
    })

    const offSample = window.api.monitor.onSample(pushSample)
    const offHistory = window.api.history.onAdded(appendHistory)
    const offDownload = window.api.downloads.onUpdated(upsertDownload)
    const offDownloadRemoved = window.api.downloads.onRemoved(removeDownload)

    return () => {
      offData()
      offState()
      offExit()
      offSample()
      offHistory()
      offDownload()
      offDownloadRemoved()
    }
  }, [updateTabState, pushSample, appendHistory, upsertDownload, removeDownload])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <ConnectionSidebar
            onCreate={() => setDialog({ open: true, editing: null })}
            onEdit={(config) => setDialog({ open: true, editing: config })}
            onManageTags={() => setTagManagerOpen(true)}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-shell-900">
          <TerminalTabs />

          <div className="relative min-h-0 flex-1">
            {tabs.length === 0 ? (
              <Welcome onCreate={() => setDialog({ open: true, editing: null })} />
            ) : (
              tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={tab.id === activeTabId ? 'absolute inset-0' : 'hidden'}
                >
                  <TerminalPane sessionId={tab.id} active={tab.id === activeTabId} />
                </div>
              ))
            )}
          </div>

          {bottomPanelOpen && activeTab && (
            <BottomPanel sessionId={activeTab.id} connected={activeTab.state === 'ready'} />
          )}
        </main>

        {rightPanelOpen && activeTab && <RightPanel sessionId={activeTab.id} connected={activeTab.state === 'ready'} />}
      </div>

      <StatusBar />

      {dialog.open && (
        <ConnectionDialog editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} />
      )}

      {tagManagerOpen && <TagManagerDialog onClose={() => setTagManagerOpen(false)} />}

      <EditorDialog />
    </div>
  )
}

function RightPanel({ sessionId, connected }: { sessionId: string; connected: boolean }) {
  const rightPanel = useAppStore((s) => s.rightPanel)
  const setRightPanel = useAppStore((s) => s.setRightPanel)

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-shell-700 bg-shell-800">
      <div className="flex shrink-0 border-b border-shell-700">
        {(
          [
            ['monitor', '监控'],
            ['sftp', '文件']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRightPanel(key)}
            className={`flex-1 border-b-2 py-1.5 text-[12px] transition-colors ${
              rightPanel === key
                ? 'border-accent-500 text-accent-400'
                : 'border-transparent text-shell-300 hover:text-shell-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {rightPanel === 'monitor' && <MonitorPanel sessionId={sessionId} connected={connected} />}
        {rightPanel === 'sftp' && <SftpPanel sessionId={sessionId} connected={connected} />}
      </div>
    </aside>
  )
}

function Welcome({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-shell-400">
      <div className="text-4xl text-shell-500">⌨</div>
      <p className="text-[13px] text-shell-300">还没有打开的会话</p>
      <p className="max-w-[280px] text-center text-[12px] leading-relaxed">
        在左侧连接树里点一台服务器即可打开终端，或者先新建一个连接。
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-1 rounded bg-accent-600 px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-accent-500"
      >
        新建连接
      </button>
    </div>
  )
}
