import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { SshTerminalApi, Unsubscribe } from '@shared/api'
import type {
  CommandHistoryEntry,
  ConnectionConfig,
  DownloadTask,
  MonitorSample,
  QuickCommand,
  RemoteFileContent,
  RemoteSaveRequest,
  RemoteSaveResult,
  SftpEntry,
  SshConnectOptions,
  SshDataEvent,
  SshExitEvent,
  SshStateEvent,
  SyncDownloadResult,
  SyncResult,
  SyncSettings,
  Tag,
  TransferProgress
} from '@shared/types'

/** 订阅主进程推送，返回取消订阅函数 */
function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api: SshTerminalApi = {
  connections: {
    list: () => ipcRenderer.invoke(IPC.connectionList) as Promise<ConnectionConfig[]>,
    save: (config) => ipcRenderer.invoke(IPC.connectionSave, config) as Promise<ConnectionConfig>,
    remove: (id) => ipcRenderer.invoke(IPC.connectionDelete, id) as Promise<boolean>,
    exportAll: () => ipcRenderer.invoke(IPC.connectionExport) as Promise<string | null>,
    importAll: () => ipcRenderer.invoke(IPC.connectionImport) as Promise<number>
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC.tagList) as Promise<Tag[]>,
    save: (tag) => ipcRenderer.invoke(IPC.tagSave, tag) as Promise<Tag>,
    remove: (id) => ipcRenderer.invoke(IPC.tagDelete, id) as Promise<boolean>
  },
  commands: {
    list: () => ipcRenderer.invoke(IPC.commandList) as Promise<QuickCommand[]>,
    save: (command) => ipcRenderer.invoke(IPC.commandSave, command) as Promise<QuickCommand>,
    remove: (id) => ipcRenderer.invoke(IPC.commandDelete, id) as Promise<boolean>
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.historyList) as Promise<CommandHistoryEntry[]>,
    remove: (id) => ipcRenderer.invoke(IPC.historyRemove, id) as Promise<boolean>,
    clear: () => ipcRenderer.invoke(IPC.historyClear) as Promise<boolean>,
    onAdded: (callback) => subscribe<CommandHistoryEntry>(IPC.historyAdded, callback)
  },
  ssh: {
    connect: (options: SshConnectOptions) => ipcRenderer.invoke(IPC.sshConnect, options) as Promise<void>,
    write: (sessionId, data, source) => ipcRenderer.send(IPC.sshWrite, { sessionId, data, source }),
    resize: (sessionId, cols, rows) => ipcRenderer.send(IPC.sshResize, { sessionId, cols, rows }),
    disconnect: (sessionId) => ipcRenderer.invoke(IPC.sshDisconnect, sessionId) as Promise<void>,
    exec: (sessionId, command) => ipcRenderer.invoke(IPC.sshExec, sessionId, command) as Promise<string>,
    onData: (callback) => subscribe<SshDataEvent>(IPC.sshData, callback),
    onState: (callback) => subscribe<SshStateEvent>(IPC.sshState, callback),
    onExit: (callback) => subscribe<SshExitEvent>(IPC.sshExit, callback)
  },
  sftp: {
    home: (sessionId) => ipcRenderer.invoke(IPC.sftpHome, sessionId) as Promise<string>,
    list: (sessionId, path) => ipcRenderer.invoke(IPC.sftpList, sessionId, path) as Promise<SftpEntry[]>,
    mkdir: (sessionId, path) => ipcRenderer.invoke(IPC.sftpMkdir, sessionId, path) as Promise<void>,
    rename: (sessionId, from, to) => ipcRenderer.invoke(IPC.sftpRename, sessionId, from, to) as Promise<void>,
    remove: (sessionId, path, isDirectory) =>
      ipcRenderer.invoke(IPC.sftpRemove, sessionId, path, isDirectory) as Promise<void>,
    upload: (sessionId, remoteDir) => ipcRenderer.invoke(IPC.sftpUpload, sessionId, remoteDir) as Promise<string[]>,
    onProgress: (callback) => subscribe<TransferProgress>(IPC.sftpProgress, callback)
  },
  downloads: {
    list: () => ipcRenderer.invoke(IPC.downloadList) as Promise<DownloadTask[]>,
    add: (sessionId, remotePath) =>
      ipcRenderer.invoke(IPC.downloadAdd, sessionId, remotePath) as Promise<DownloadTask[]>,
    addMany: (sessionId, remotePaths) =>
      ipcRenderer.invoke(IPC.downloadAddMany, sessionId, remotePaths) as Promise<DownloadTask[]>,
    pause: (id) => ipcRenderer.invoke(IPC.downloadPause, id) as Promise<void>,
    resume: (id) => ipcRenderer.invoke(IPC.downloadResume, id) as Promise<void>,
    cancel: (id) => ipcRenderer.invoke(IPC.downloadCancel, id) as Promise<void>,
    retry: (id) => ipcRenderer.invoke(IPC.downloadRetry, id) as Promise<void>,
    remove: (id) => ipcRenderer.invoke(IPC.downloadRemove, id) as Promise<boolean>,
    clearFinished: () => ipcRenderer.invoke(IPC.downloadClearFinished) as Promise<boolean>,
    openFolder: (id) => ipcRenderer.invoke(IPC.downloadOpenFolder, id) as Promise<void>,
    onUpdated: (callback) => subscribe<DownloadTask>(IPC.downloadUpdated, callback),
    onRemoved: (callback) => subscribe<string>(IPC.downloadRemoved, callback)
  },
  editor: {
    read: (sessionId, path) => ipcRenderer.invoke(IPC.editorRead, sessionId, path) as Promise<RemoteFileContent>,
    save: (request: RemoteSaveRequest) => ipcRenderer.invoke(IPC.editorSave, request) as Promise<RemoteSaveResult>
  },
  sync: {
    getSettings: () => ipcRenderer.invoke(IPC.syncGetSettings) as Promise<SyncSettings | null>,
    saveSettings: (settings: SyncSettings) =>
      ipcRenderer.invoke(IPC.syncSaveSettings, settings) as Promise<void>,
    pickFolder: () => ipcRenderer.invoke(IPC.syncPickFolder) as Promise<string | null>,
    upload: (masterPassword: string) =>
      ipcRenderer.invoke(IPC.syncUpload, masterPassword) as Promise<SyncResult>,
    download: (masterPassword: string) =>
      ipcRenderer.invoke(IPC.syncDownload, masterPassword) as Promise<SyncDownloadResult>,
    onStatus: (callback) => subscribe<SyncResult>(IPC.syncStatus, callback)
  },
  dialog: {
    pickPrivateKey: () => ipcRenderer.invoke(IPC.pickPrivateKey) as Promise<string | null>
  },
  monitor: {
    start: (sessionId) => ipcRenderer.invoke(IPC.monitorStart, sessionId) as Promise<void>,
    stop: (sessionId) => ipcRenderer.invoke(IPC.monitorStop, sessionId) as Promise<void>,
    onSample: (callback) => subscribe<MonitorSample>(IPC.monitorSample, callback)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose)
  }
}

contextBridge.exposeInMainWorld('api', api)
