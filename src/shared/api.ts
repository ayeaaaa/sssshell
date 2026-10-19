/**
 * 渲染进程可见的 API 形状。预加载脚本实现它，并挂到 window.api 上。
 * 放在 shared 里是为了让渲染进程只依赖类型，不依赖 electron 模块。
 */
import type {
  ConnectionConfig,
  MonitorSample,
  QuickCommand,
  SftpEntry,
  SshConnectOptions,
  SshDataEvent,
  SshExitEvent,
  SshStateEvent,
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
  ssh: {
    connect(options: SshConnectOptions): Promise<void>
    write(sessionId: string, data: string): void
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
    /** 弹出目录选择框，返回本地保存路径；取消返回 null */
    download(sessionId: string, remotePath: string): Promise<string | null>
    /** 弹出文件选择框，返回已上传的远程路径列表 */
    upload(sessionId: string, remoteDir: string): Promise<string[]>
    onProgress(callback: (progress: TransferProgress) => void): Unsubscribe
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
