import { create } from 'zustand'
import type {
  CommandHistoryEntry,
  ConnectionConfig,
  MonitorSample,
  QuickCommand,
  SshSessionState,
  Tag
} from '@shared/types'

export interface TerminalTab {
  /** 同时作为 SSH 会话 ID */
  id: string
  connectionId?: string
  title: string
  host: string
  username: string
  state: SshSessionState
  message?: string
  openedAt: number
}

export type RightPanel = 'monitor' | 'sftp'
export type BottomPanelTab = 'commands' | 'history'
export type DropPosition = 'before' | 'after'

/** 监控曲线保留的采样点数 */
const SAMPLE_HISTORY = 60

interface AppState {
  connections: ConnectionConfig[]
  tags: Tag[]
  commands: QuickCommand[]
  /** 左侧连接树的标签筛选，null 表示不筛选 */
  activeTagId: string | null
  tabs: TerminalTab[]
  activeTabId: string | null
  rightPanel: RightPanel
  rightPanelOpen: boolean
  /** 底部命令抽屉，默认收起 */
  bottomPanelOpen: boolean
  bottomPanelTab: BottomPanelTab
  history: CommandHistoryEntry[]
  /** sessionId -> 最近若干次采样 */
  samples: Record<string, MonitorSample[]>

  loadConnections: () => Promise<void>
  loadTags: () => Promise<void>
  saveConnection: (
    config: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'username'>
  ) => Promise<ConnectionConfig>
  deleteConnection: (id: string) => Promise<void>

  saveTag: (name: string, color?: string, id?: string) => Promise<Tag>
  deleteTag: (id: string) => Promise<void>
  setActiveTagFilter: (id: string | null) => void

  loadCommands: () => Promise<void>
  saveCommand: (
    input: Partial<QuickCommand> & Pick<QuickCommand, 'name' | 'command'>
  ) => Promise<QuickCommand>
  deleteCommand: (id: string) => Promise<void>

  loadHistory: () => Promise<void>
  removeHistory: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  appendHistory: (entry: CommandHistoryEntry) => void

  openConnection: (config: ConnectionConfig) => Promise<void>
  closeTab: (id: string) => Promise<void>
  closeOtherTabs: (id: string) => Promise<void>
  closeTabsToRight: (id: string) => Promise<void>
  closeAllTabs: () => Promise<void>
  moveTab: (draggedId: string, targetId: string, position: DropPosition) => void
  renameTab: (id: string, title: string) => void
  setActiveTab: (id: string) => void
  updateTabState: (id: string, state: SshSessionState, message?: string) => void

  setRightPanel: (panel: RightPanel) => void
  toggleRightPanel: () => void
  toggleBottomPanel: () => void
  openBottomPanel: (tab: BottomPanelTab) => void
  closeBottomPanel: () => void
  pushSample: (sample: MonitorSample) => void
}

function createSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useAppStore = create<AppState>((set, get) => {
  /** 关闭一组标签：先断开连接，再决定新的激活标签 */
  const closeTabs = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return

    const idSet = new Set(ids)
    await Promise.all(ids.map((id) => window.api.ssh.disconnect(id)))

    const all = get().tabs
    const tabs = all.filter((t) => !idSet.has(t.id))
    const samples = { ...get().samples }
    for (const id of ids) delete samples[id]

    let activeTabId = get().activeTabId
    if (activeTabId && idSet.has(activeTabId)) {
      // 关掉当前标签时，优先落到右边那个，没有就落左边
      const lastClosedIndex = Math.max(...ids.map((id) => all.findIndex((t) => t.id === id)))
      activeTabId = tabs.length > 0 ? tabs[Math.min(lastClosedIndex, tabs.length - 1)].id : null
    }

    set({ tabs, activeTabId, samples })
  }

  return {
    connections: [],
    tags: [],
    commands: [],
    activeTagId: null,
    tabs: [],
    activeTabId: null,
    rightPanel: 'monitor',
    rightPanelOpen: true,
    bottomPanelOpen: false,
    bottomPanelTab: 'commands',
    history: [],
    samples: {},

    async loadConnections() {
      set({ connections: await window.api.connections.list() })
    },

    async loadTags() {
      set({ tags: await window.api.tags.list() })
    },

    async saveConnection(config) {
      const saved = await window.api.connections.save(config)
      const existing = get().connections.some((c) => c.id === saved.id)
      set({
        connections: existing
          ? get().connections.map((c) => (c.id === saved.id ? saved : c))
          : [...get().connections, saved]
      })
      return saved
    },

    async deleteConnection(id) {
      await window.api.connections.remove(id)
      set({ connections: get().connections.filter((c) => c.id !== id) })
    },

    async saveTag(name, color, id) {
      const tag = await window.api.tags.save({ id, name, color })
      const exists = get().tags.some((t) => t.id === tag.id)
      set({
        tags: exists ? get().tags.map((t) => (t.id === tag.id ? tag : t)) : [...get().tags, tag]
      })
      return tag
    },

    async deleteTag(id) {
      await window.api.tags.remove(id)
      set({
        tags: get().tags.filter((t) => t.id !== id),
        activeTagId: get().activeTagId === id ? null : get().activeTagId,
        // 主进程已经把这些标签从连接上摘掉了，这里同步一下本地副本
        connections: get().connections.map((c) => ({ ...c, tags: c.tags.filter((t) => t !== id) }))
      })
    },

    setActiveTagFilter(id) {
      set({ activeTagId: id })
    },

    async loadCommands() {
      set({ commands: await window.api.commands.list() })
    },

    async saveCommand(input) {
      const saved = await window.api.commands.save(input)
      const exists = get().commands.some((c) => c.id === saved.id)
      set({
        commands: exists
          ? get().commands.map((c) => (c.id === saved.id ? saved : c))
          : [...get().commands, saved]
      })
      return saved
    },

    async deleteCommand(id) {
      await window.api.commands.remove(id)
      set({ commands: get().commands.filter((c) => c.id !== id) })
    },

    async loadHistory() {
      set({ history: await window.api.history.list() })
    },

    async removeHistory(id) {
      await window.api.history.remove(id)
      set({ history: get().history.filter((entry) => entry.id !== id) })
    },

    async clearHistory() {
      await window.api.history.clear()
      set({ history: [] })
    },

    appendHistory(entry) {
      // 主进程对连续重复命令会复用同一条记录，这里按 id 去重后置顶
      set({ history: [entry, ...get().history.filter((item) => item.id !== entry.id)] })
    },

    async openConnection(config) {
      const id = createSessionId()
      const tab: TerminalTab = {
        id,
        connectionId: config.id,
        title: config.name || `${config.username}@${config.host}`,
        host: config.host,
        username: config.username,
        state: 'connecting',
        openedAt: Date.now()
      }

      set({ tabs: [...get().tabs, tab], activeTabId: id })

      await window.api.ssh.connect({
        sessionId: id,
        host: config.host,
        port: config.port,
        username: config.username,
        authMethod: config.authMethod,
        password: config.password,
        privateKeyPath: config.privateKeyPath,
        privateKeyPassphrase: config.privateKeyPassphrase,
        keepaliveInterval: config.keepaliveInterval,
        cols: 120,
        rows: 30
      })
    },

    async closeTab(id) {
      await closeTabs([id])
    },

    async closeOtherTabs(id) {
      await closeTabs(get().tabs.filter((t) => t.id !== id).map((t) => t.id))
    },

    async closeTabsToRight(id) {
      const tabs = get().tabs
      const index = tabs.findIndex((t) => t.id === id)
      if (index < 0) return
      await closeTabs(tabs.slice(index + 1).map((t) => t.id))
    },

    async closeAllTabs() {
      await closeTabs(get().tabs.map((t) => t.id))
    },

    moveTab(draggedId, targetId, position) {
      if (draggedId === targetId) return
      const tabs = [...get().tabs]
      const from = tabs.findIndex((t) => t.id === draggedId)
      if (from < 0) return

      const [moved] = tabs.splice(from, 1)
      let to = tabs.findIndex((t) => t.id === targetId)
      if (to < 0) return
      if (position === 'after') to += 1

      tabs.splice(to, 0, moved)
      set({ tabs })
    },

    renameTab(id, title) {
      const next = title.trim()
      if (!next) return
      set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, title: next } : t)) })
    },

    setActiveTab(id) {
      set({ activeTabId: id })
    },

    updateTabState(id, state, message) {
      set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, state, message } : t)) })
    },

    setRightPanel(panel) {
      set({ rightPanel: panel, rightPanelOpen: true })
    },

    toggleRightPanel() {
      set({ rightPanelOpen: !get().rightPanelOpen })
    },

    toggleBottomPanel() {
      set({ bottomPanelOpen: !get().bottomPanelOpen })
    },

    openBottomPanel(tab) {
      set({ bottomPanelOpen: true, bottomPanelTab: tab })
    },

    closeBottomPanel() {
      set({ bottomPanelOpen: false })
    },

    pushSample(sample) {
      const history = get().samples[sample.sessionId] ?? []
      const next = [...history, sample].slice(-SAMPLE_HISTORY)
      set({ samples: { ...get().samples, [sample.sessionId]: next } })
    }
  }
})
