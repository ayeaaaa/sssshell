/**
 * IPC 频道名常量。主进程与预加载脚本共用，避免手写字符串出错。
 */
export const IPC = {
  /** 连接配置的增删改查 */
  connectionList: 'connection:list',
  connectionSave: 'connection:save',
  connectionDelete: 'connection:delete',
  connectionExport: 'connection:export',
  connectionImport: 'connection:import',

  /** 标签 */
  tagList: 'tag:list',
  tagSave: 'tag:save',
  tagDelete: 'tag:delete',

  /** 快捷命令 */
  commandList: 'command:list',
  commandSave: 'command:save',
  commandDelete: 'command:delete',

  /** 命令历史 */
  historyList: 'history:list',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  historyAdded: 'history:added',

  /** 下载管理器 */
  downloadList: 'download:list',
  downloadAdd: 'download:add',
  downloadPause: 'download:pause',
  downloadResume: 'download:resume',
  downloadCancel: 'download:cancel',
  downloadRetry: 'download:retry',
  downloadRemove: 'download:remove',
  downloadClearFinished: 'download:clear-finished',
  downloadOpenFolder: 'download:open-folder',
  downloadUpdated: 'download:updated',
  downloadRemoved: 'download:removed',

  /** 在线编辑 */
  editorRead: 'editor:read',
  editorSave: 'editor:save',

  /** SSH 会话 */
  sshConnect: 'ssh:connect',
  sshWrite: 'ssh:write',
  sshResize: 'ssh:resize',
  sshDisconnect: 'ssh:disconnect',
  sshExec: 'ssh:exec',

  /** 主进程 -> 渲染进程 的推送事件 */
  sshData: 'ssh:data',
  sshState: 'ssh:state',
  sshExit: 'ssh:exit',

  /** SFTP */
  sftpList: 'sftp:list',
  sftpHome: 'sftp:home',
  sftpMkdir: 'sftp:mkdir',
  sftpRename: 'sftp:rename',
  sftpRemove: 'sftp:remove',
  sftpDownload: 'sftp:download',
  sftpUpload: 'sftp:upload',
  sftpProgress: 'sftp:progress',

  /** 监控 */
  monitorStart: 'monitor:start',
  monitorStop: 'monitor:stop',
  monitorSample: 'monitor:sample',

  /** 窗口控制（自绘标题栏用） */
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
