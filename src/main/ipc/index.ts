import { readFileSync, writeFileSync } from 'node:fs'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron'
import { IPC } from '@shared/ipc'
import type { CommandHistoryEntry, ConnectionConfig, DownloadTask, QuickCommand, RemoteSaveRequest, SshConnectOptions, SshResizeRequest, SshWriteRequest, Tag } from '@shared/types'
import type { ConnectionStore } from '../store/connectionStore'
import type { CommandStore } from '../store/commandStore'
import type { HistoryStore } from '../store/historyStore'
import type { DownloadManager } from '../download/DownloadManager'
import type { EditorService } from '../editor/EditorService'
import { remoteStat } from '../sftp/remoteFs'
import type { SessionManager } from '../ssh/SessionManager'
import type { SftpService } from '../sftp/SftpService'
import type { MonitorService } from '../monitor/MonitorService'
import { broadcast } from './broadcast'

export interface IpcDeps {
  store: ConnectionStore
  commands: CommandStore
  history: HistoryStore
  sessions: SessionManager
  sftp: SftpService
  monitor: MonitorService
  downloads: DownloadManager
  editor: EditorService
}

export function registerIpc({
  store,
  commands,
  history,
  sessions,
  sftp,
  monitor,
  downloads,
  editor
}: IpcDeps): void {
  // ---------- 连接配置 ----------
  ipcMain.handle(IPC.connectionList, (): ConnectionConfig[] => store.list())

  ipcMain.handle(IPC.connectionSave, (_event, config: ConnectionConfig): ConnectionConfig => store.save(config))

  ipcMain.handle(IPC.connectionDelete, (_event, id: string): boolean => store.delete(id))

  ipcMain.handle(IPC.connectionExport, async (): Promise<string | null> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出连接配置',
      defaultPath: 'ssh-connections.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    writeFileSync(filePath, store.exportAll(), 'utf8')
    return filePath
  })

  ipcMain.handle(IPC.connectionImport, async (): Promise<number> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入连接配置',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || filePaths.length === 0) return 0
    return store.importAll(readFileSync(filePaths[0], 'utf8'))
  })

  // ---------- 标签 ----------
  ipcMain.handle(IPC.tagList, (): Tag[] => store.listTags())

  ipcMain.handle(IPC.tagSave, (_event, tag: Partial<Tag> & Pick<Tag, 'name'>): Tag => store.saveTag(tag))

  ipcMain.handle(IPC.tagDelete, (_event, id: string): boolean => store.deleteTag(id))

  // ---------- 快捷命令 ----------
  ipcMain.handle(IPC.commandList, (): QuickCommand[] => commands.list())

  ipcMain.handle(
    IPC.commandSave,
    (_event, command: Partial<QuickCommand> & Pick<QuickCommand, 'name' | 'command'>): QuickCommand =>
      commands.save(command)
  )

  ipcMain.handle(IPC.commandDelete, (_event, id: string): boolean => commands.delete(id))

  // ---------- 命令历史 ----------
  ipcMain.handle(IPC.historyList, (): CommandHistoryEntry[] => history.list())

  ipcMain.handle(IPC.historyRemove, (_event, id: string): boolean => history.remove(id))

  ipcMain.handle(IPC.historyClear, (): boolean => history.clear())

  // ---------- SSH 会话 ----------
  ipcMain.handle(IPC.sshConnect, (_event, options: SshConnectOptions): void => {
    sessions.connect(options)
  })

  ipcMain.on(IPC.sshWrite, (_event, payload: SshWriteRequest): void => {
    sessions.write(payload.sessionId, payload.data, payload.source)
  })

  ipcMain.on(IPC.sshResize, (_event, payload: SshResizeRequest): void => {
    sessions.resize(payload.sessionId, payload.cols, payload.rows)
  })

  ipcMain.handle(IPC.sshDisconnect, (_event, sessionId: string): void => {
    monitor.stop(sessionId)
    sessions.disconnect(sessionId)
  })

  ipcMain.handle(IPC.sshExec, (_event, sessionId: string, command: string): Promise<string> => {
    return sessions.exec(sessionId, command)
  })

  // ---------- SFTP ----------
  ipcMain.handle(IPC.sftpHome, (_event, sessionId: string) => sftp.home(sessionId))
  ipcMain.handle(IPC.sftpList, (_event, sessionId: string, path: string) => sftp.list(sessionId, path))
  ipcMain.handle(IPC.sftpMkdir, (_event, sessionId: string, path: string) => sftp.mkdir(sessionId, path))
  ipcMain.handle(IPC.sftpRename, (_event, sessionId: string, from: string, to: string) =>
    sftp.rename(sessionId, from, to)
  )
  ipcMain.handle(
    IPC.sftpRemove,
    (_event, sessionId: string, path: string, isDirectory: boolean) => sftp.remove(sessionId, path, isDirectory)
  )

  ipcMain.handle(IPC.sftpUpload, async (event, sessionId: string, remoteDir: string): Promise<string[]> => {
    const files = await pickFiles(event, '选择要上传的文件')
    if (files.length === 0) return []

    const uploaded: string[] = []
    for (const file of files) {
      uploaded.push(await sftp.upload(sessionId, file, remoteDir, (p) => broadcast(IPC.sftpProgress, p)))
    }
    return uploaded
  })

  // ---------- 下载管理器 ----------
  ipcMain.handle(IPC.downloadList, (): DownloadTask[] => downloads.list())

  ipcMain.handle(
    IPC.downloadAdd,
    async (event, sessionId: string, remotePath: string): Promise<DownloadTask | null> => {
      // E2E 测试时用环境变量指定下载目录，跳过系统目录选择框
      const localDir =
        process.env['SSH_TERMINAL_DOWNLOAD_DIR'] ?? (await pickDirectory(event, '选择下载目录'))
      if (!localDir) return null

      const session = sessions.get(sessionId)
      if (!session) throw new Error('会话不存在或已断开')
      const sftpWrapper = await session.getSftp()
      const stats = await remoteStat(sftpWrapper, remotePath)

      return downloads.add({
        sessionId,
        sessionLabel: session.label,
        remotePath,
        localDir,
        size: stats.size
      })
    }
  )

  ipcMain.handle(IPC.downloadPause, (_event, id: string): void => downloads.pause(id))
  ipcMain.handle(IPC.downloadResume, (_event, id: string): void => downloads.resume(id))
  ipcMain.handle(IPC.downloadCancel, (_event, id: string): void => downloads.cancel(id))
  ipcMain.handle(IPC.downloadRetry, (_event, id: string): void => downloads.retry(id))

  ipcMain.handle(IPC.downloadRemove, (_event, id: string): boolean => {
    const removed = downloads.remove(id)
    if (removed) broadcast(IPC.downloadRemoved, id)
    return removed
  })

  ipcMain.handle(IPC.downloadClearFinished, (): boolean => {
    const removed = downloads.clearFinished()
    for (const id of removed) broadcast(IPC.downloadRemoved, id)
    return removed.length > 0
  })

  ipcMain.handle(IPC.downloadOpenFolder, (_event, id: string): void => downloads.openFolder(id))

  // ---------- 在线编辑 ----------
  ipcMain.handle(IPC.editorRead, (_event, sessionId: string, path: string) => editor.read(sessionId, path))

  ipcMain.handle(IPC.editorSave, (_event, request: RemoteSaveRequest) => editor.save(request))

  // ---------- 监控 ----------
  ipcMain.handle(IPC.monitorStart, (_event, sessionId: string): void => monitor.start(sessionId))
  ipcMain.handle(IPC.monitorStop, (_event, sessionId: string): void => monitor.stop(sessionId))

  // ---------- 窗口控制 ----------
  ipcMain.on(IPC.windowMinimize, (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.windowClose, (event) => BrowserWindow.fromWebContents(event.sender)?.close())
}

/** 弹目录选择框，优先挂在当前窗口上（模态） */
async function pickDirectory(event: IpcMainInvokeEvent, title: string): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const options: OpenDialogOptions = { title, properties: ['openDirectory', 'createDirectory'] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

/** 弹文件选择框，支持多选 */
async function pickFiles(event: IpcMainInvokeEvent, title: string): Promise<string[]> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const options: OpenDialogOptions = { title, properties: ['openFile', 'multiSelections'] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}
