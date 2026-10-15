import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { SshDataEvent, SshExitEvent, SshStateEvent } from '@shared/types'
import { SessionManager } from './ssh/SessionManager'
import { ConnectionStore } from './store/connectionStore'
import { SftpService } from './sftp/SftpService'
import { MonitorService } from './monitor/MonitorService'
import { registerIpc } from './ipc'
import { broadcast } from './ipc/broadcast'

let mainWindow: BrowserWindow | null = null

const store = new ConnectionStore()
const sessions = new SessionManager({
  onData: (sessionId, data) => broadcast(IPC.sshData, { sessionId, data } satisfies SshDataEvent),
  onState: (sessionId, state, message) => broadcast(IPC.sshState, { sessionId, state, message } satisfies SshStateEvent),
  onExit: (sessionId, code, signal) => broadcast(IPC.sshExit, { sessionId, code, signal } satisfies SshExitEvent)
})
const sftp = new SftpService(sessions)
const monitor = new MonitorService(sessions, (sample) => broadcast(IPC.monitorSample, sample))

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#1b1d22',
    title: 'SSH Terminal',
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
  app.setAppUserModelId('com.example.sshterminal')
  registerIpc({ store, sessions, sftp, monitor })
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
  sessions.disconnectAll()
})
