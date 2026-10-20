import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { SshDataEvent, SshExitEvent, SshStateEvent } from '@shared/types'
import { SessionManager } from './ssh/SessionManager'
import { ConnectionStore } from './store/connectionStore'
import { CommandStore } from './store/commandStore'
import { HistoryStore } from './store/historyStore'
import { DownloadManager } from './download/DownloadManager'
import { EditorService } from './editor/EditorService'
import { SyncService } from './sync/SyncService'
import { SftpService } from './sftp/SftpService'
import { MonitorService } from './monitor/MonitorService'
import { registerIpc } from './ipc'
import { broadcast } from './ipc/broadcast'

let mainWindow: BrowserWindow | null = null

/**
 * 应用从 ssh-terminal 改名为 SimpleShell，userData 目录也跟着变了。
 * 首次启动时把旧目录的数据复制过来，避免连接和设置丢失。
 */
function migrateUserData(): void {
  const target = app.getPath('userData')
  const legacy = join(app.getPath('appData'), 'ssh-terminal')
  if (target === legacy) return

  const marker = join(target, '.migrated-from-ssh-terminal')
  if (existsSync(marker) || !existsSync(legacy)) return

  try {
    mkdirSync(target, { recursive: true })
    for (const name of [
      'connections.json',
      'quick-commands.json',
      'command-history.json',
      'downloads.json',
      'sync.json'
    ]) {
      const from = join(legacy, name)
      if (existsSync(from)) copyFileSync(from, join(target, name))
    }
    writeFileSync(marker, new Date().toISOString(), 'utf8')
  } catch {
    // 复制失败就让用户重新配置，至少应用还能启动
  }
}

migrateUserData()

const store = new ConnectionStore()
const commands = new CommandStore()
const history = new HistoryStore()
const sessions = new SessionManager({
  onData: (sessionId, data) => broadcast(IPC.sshData, { sessionId, data } satisfies SshDataEvent),
  onState: (sessionId, state, message) => broadcast(IPC.sshState, { sessionId, state, message } satisfies SshStateEvent),
  onExit: (sessionId, code, signal) => broadcast(IPC.sshExit, { sessionId, code, signal } satisfies SshExitEvent),
  onCommand: (record) => broadcast(IPC.historyAdded, history.add(record))
})
const sftp = new SftpService(sessions)
const monitor = new MonitorService(sessions, (sample) => broadcast(IPC.monitorSample, sample))
const downloads = new DownloadManager(sessions, (task) => broadcast(IPC.downloadUpdated, task))
const editor = new EditorService(sessions)
const sync = new SyncService(store, commands, (result) => broadcast(IPC.syncStatus, result))

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#1b1d22',
    title: 'SimpleShell',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // ESM preload / ssh2 需要 Node 环境
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.simpleshell.app')
  registerIpc({ store, commands, history, sessions, sftp, monitor, downloads, editor, sync })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  monitor.stopAll()
  downloads.shutdown()
  sessions.disconnectAll()
})
