import { create } from 'zustand'
import type { ConnectionConfig, MonitorSample, SshSessionState } from '@shared/types'

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

/** 监控曲线保留的采样点数 */
const SAMPLE_HISTORY = 60

interface AppState {
  connections: ConnectionConfig[]
  tabs: TerminalTab[]
  activeTabId: string | null
  rightPanel: RightPanel
  rightPanelOpen: boolean
  /** sessionId -> 最近若干次采样 */
  samples: Record<string, MonitorSample[]>

  loadConnections: () => Promise<void>
  saveConnection: (
    config: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'username'>
  ) => Promise<ConnectionConfig>
  deleteConnection: (id: string) => Promise<void>

  openConnection: (config: ConnectionConfig) => Promise<void>
  closeTab: (id: string) => Promise<void>
  setActiveTab: (id: string) => void
  updateTabState: (id: string, state: SshSessionState, message?: string) => void

  setRightPanel: (panel: RightPanel) => void
  toggleRightPanel: () => void
  pushSample: (sample: MonitorSample) => void
}

function createSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  tabs: [],
  activeTabId: null,
  rightPanel: 'monitor',
  rightPanelOpen: true,
  samples: {},

  async loadConnections() {
    set({ connections: await window.api.connections.list() })
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
    await window.api.ssh.disconnect(id)
    const tabs = get().tabs.filter((t) => t.id !== id)
    const samples = { ...get().samples }
    delete samples[id]

    let activeTabId = get().activeTabId
    if (activeTabId === id) activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null

    set({ tabs, activeTabId, samples })
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

  pushSample(sample) {
    const history = get().samples[sample.sessionId] ?? []
    const next = [...history, sample].slice(-SAMPLE_HISTORY)
    set({ samples: { ...get().samples, [sample.sessionId]: next } })
  }
}))
