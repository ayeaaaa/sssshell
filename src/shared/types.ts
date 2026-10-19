/**
 * 主进程 / 预加载 / 渲染进程共用的类型定义。
 * 只放纯类型和常量，不要在这里 import Electron 或 Node 的模块。
 */

export type AuthMethod = 'password' | 'privateKey'

/** 连接标签，用于给服务器分类（生产 / 测试 / 客户 A…） */
export interface Tag {
  id: string
  name: string
  /** 十六进制颜色，例如 #3d9be9 */
  color: string
}

/** 一条保存的连接配置（对应 FinalShell 左侧的连接树节点） */
export interface ConnectionConfig {
  id: string
  /** 显示名称，留空时用 username@host */
  name: string
  /** 所属分组，例如 "生产环境" */
  group: string
  /** 关联的标签 ID 列表 */
  tags: string[]
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  /** authMethod = password 时使用 */
  password?: string
  /** authMethod = privateKey 时使用 */
  privateKeyPath?: string
  privateKeyPassphrase?: string
  /** 心跳间隔（秒），0 表示关闭 */
  keepaliveInterval: number
  createdAt: number
  updatedAt: number
}

/** 建立连接时渲染进程传给主进程的参数 */
export type SshConnectOptions = Pick<
  ConnectionConfig,
  | 'host'
  | 'port'
  | 'username'
  | 'authMethod'
  | 'password'
  | 'privateKeyPath'
  | 'privateKeyPassphrase'
  | 'keepaliveInterval'
> & {
  /** 渲染进程生成的会话 ID */
  sessionId: string
  /** 终端初始尺寸 */
  cols: number
  rows: number
}

export type SshSessionState = 'connecting' | 'ready' | 'closed' | 'error'

export interface SshDataEvent {
  sessionId: string
  data: string
}

export interface SshStateEvent {
  sessionId: string
  state: SshSessionState
  message?: string
}

export interface SshExitEvent {
  sessionId: string
  code: number | null
  signal?: string
}

export interface SshResizeRequest {
  sessionId: string
  cols: number
  rows: number
}

export interface SshWriteRequest {
  sessionId: string
  data: string
}

/** SFTP 目录项 */
export interface SftpEntry {
  name: string
  path: string
  /** 目录 */
  isDirectory: boolean
  isSymlink: boolean
  size: number
  /** Unix 时间戳（毫秒） */
  modifiedAt: number
  mode: number
  owner: number
  group: number
}

/** 文件传输进度（上传 / 下载共用） */
export interface TransferProgress {
  sessionId: string
  direction: 'upload' | 'download'
  name: string
  transferred: number
  total: number
}

/** 服务器监控面板的一次采样 */
export interface MonitorSample {
  sessionId: string
  timestamp: number
  cpuUsage: number
  memTotal: number
  memUsed: number
  swapTotal: number
  swapUsed: number
  diskTotal: number
  diskUsed: number
  /** 每秒收发字节数 */
  netRxRate: number
  netTxRate: number
  uptimeSeconds: number
  loadAverage: [number, number, number]
  processCount: number
}
