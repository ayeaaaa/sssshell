/**
 * 渲染进程可见的 API 形状。预加载脚本实现它，并挂到 window.api 上。
 * 放在 shared 里是为了让渲染进程只依赖类型，不依赖 electron 模块。
 */
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
} from './types'

export type Unsubscribe = () => void

export interface SshTerminalApi {
  connections: {
    list(): Promise<ConnectionConfig[]>
    save(config: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'username'>): Promise<ConnectionConfig>
    remove(id: string): Promise<boolean>
    /** 导出到用户选择的文件，返回路径；取消返回 null */
    exportAll(): Promise<string | null>
    /** 从文件导入，返回导入条数 */
    importAll(): Promise<number>
  }
  tags: {
    list(): Promise<Tag[]>
    save(tag: Partial<Tag> & Pick<Tag, 'name'>): Promise<Tag>
    /** 删除标签，同时会从所有连接上摘掉 */
    remove(id: string): Promise<boolean>
  }
  commands: {
    list(): Promise<QuickCommand[]>
    save(
      command: Partial<QuickCommand> & Pick<QuickCommand, 'name' | 'command'>
    ): Promise<QuickCommand>
    remove(id: string): Promise<boolean>
  }
  history: {
    list(): Promise<CommandHistoryEntry[]>
    remove(id: string): Promise<boolean>
    clear(): Promise<boolean>
    /** 主进程记录了一条新命令后推送 */
    onAdded(callback: (entry: CommandHistoryEntry) => void): Unsubscribe
  }
  ssh: {
    connect(options: SshConnectOptions): Promise<void>
    write(sessionId: string, data: string, source?: 'terminal' | 'quick'): void
    resize(sessionId: string, cols: number, rows: number): void
    disconnect(sessionId: string): Promise<void>
    exec(sessionId: string, command: string): Promise<string>
    onData(callback: (event: SshDataEvent) => void): Unsubscribe
    onState(callback: (event: SshStateEvent) => void): Unsubscribe
    onExit(callback: (event: SshExitEvent) => void): Unsubscribe
  }
  sftp: {
    home(sessionId: string): Promise<string>
    list(sessionId: string, path: string): Promise<SftpEntry[]>
    mkdir(sessionId: string, path: string): Promise<void>
    rename(sessionId: string, from: string, to: string): Promise<void>
    remove(sessionId: string, path: string, isDirectory: boolean): Promise<void>
    /** 弹出目录选择框，返回已上传的远程路径列表 */
    upload(sessionId: string, remoteDir: string): Promise<string[]>
    onProgress(callback: (progress: TransferProgress) => void): Unsubscribe
  }
  downloads: {
    list(): Promise<DownloadTask[]>
    /** 加入下载队列（目录会展开成多个任务）；不传 localDir 时弹出目录选择框，取消返回空数组 */
    add(sessionId: string, remotePath: string, localDir?: string): Promise<DownloadTask[]>
    /** 批量加入下载队列，只弹一次目录选择框 */
    addMany(sessionId: string, remotePaths: string[]): Promise<DownloadTask[]>
    pause(id: string): Promise<void>
    resume(id: string): Promise<void>
    cancel(id: string): Promise<void>
    retry(id: string): Promise<void>
    remove(id: string): Promise<boolean>
    /** 清掉已完成 / 已取消的记录，返回是否真的删了东西 */
    clearFinished(): Promise<boolean>
    openFolder(id: string): Promise<void>
    onUpdated(callback: (task: DownloadTask) => void): Unsubscribe
    onRemoved(callback: (id: string) => void): Unsubscribe
  }
  editor: {
    read(sessionId: string, path: string): Promise<RemoteFileContent>
    save(request: RemoteSaveRequest): Promise<RemoteSaveResult>
  }
  sync: {
    getSettings(): Promise<SyncSettings | null>
    saveSettings(settings: SyncSettings): Promise<void>
    /** 弹出文件夹选择框，用于本地同步目录 */
    pickFolder(): Promise<string | null>
    upload(masterPassword: string): Promise<SyncResult>
    download(masterPassword: string): Promise<SyncDownloadResult>
    /** 自动上传结果推送 */
    onStatus(callback: (result: SyncResult) => void): Unsubscribe
  }
  monitor: {
    start(sessionId: string): Promise<void>
    stop(sessionId: string): Promise<void>
    onSample(callback: (sample: MonitorSample) => void): Unsubscribe
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
}
