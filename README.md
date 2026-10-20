# SimpleShell

Windows 下的 SSH / SFTP 客户端：连接树 + 多标签终端 + 服务器监控 + 文件管理，装在一个桌面应用里。

能连服务器、开交互式 Shell、看监控、传文件、在线编辑、同步配置。路线见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 外壳 | Electron 44 | Windows 下打包、自绘标题栏、系统对话框都最省事 |
| 主进程 | TypeScript + [ssh2](https://github.com/mscdex/ssh2) | SSH 连接、Shell 通道、SFTP 子系统、监控采集 |
| 渲染进程 | React 19 + Vite 8 | 界面 |
| 终端 | [xterm.js](https://xtermjs.org/) 6 | 终端渲染、fit / search / web-links 插件 |
| 样式 | Tailwind CSS 4 | 主题令牌写在 `@theme` 里，改一处即可换肤 |
| 状态 | Zustand 5 | 标签页、连接列表、监控采样 |

## 目录结构

```
src/
├─ main/                    Electron 主进程
│  ├─ index.ts              窗口创建、模块装配
│  ├─ ipc/                  IPC 注册（连接配置 / SSH / SFTP / 监控 / 窗口控制）
│  ├─ ssh/
│  │  ├─ SshSession.ts      单个会话：连接、shell、exec、SFTP 复用
│  │  └─ SessionManager.ts  活跃会话表
│  ├─ sftp/
│  │  ├─ SftpService.ts      目录浏览、增删改、上传
│  │  └─ remoteFs.ts         Promise 化的 SFTP 基础操作
│  ├─ download/
│  │  ├─ DownloadManager.ts  下载队列、断点续传、历史记录
│  │  ├─ DownloadQueue.ts    并发调度（最多 2 个同时下载）
│  │  └─ pathUtils.ts        同名文件自动加 (1) 后缀
│  ├─ editor/
│  │  ├─ EditorService.ts    远程文本读写、mtime 冲突检测、原子替换
│  │  └─ binary.ts           二进制内容判定
│  ├─ sync/
│  │  ├─ SyncService.ts      配置打包、上传 / 下载、自动上传
│  │  ├─ crypto.ts           主密码 + AES-256-GCM 加解密
│  │  ├─ backends.ts         本地 / WebDAV / FTP / SFTP 四种存储
│  │  └─ merge.ts            按 id 合并配置
│  ├─ monitor/MonitorService.ts  解析 /proc 得到 CPU / 内存 / 磁盘 / 网络
│  └─ store/
│     ├─ connectionStore.ts  连接 + 标签持久化（userData/connections.json）
│     ├─ commandStore.ts     快捷命令持久化（userData/quick-commands.json）
│     └─ historyStore.ts     命令历史持久化（userData/command-history.json）
├─ preload/index.ts         暴露 window.api，渲染进程只拿得到这些方法
├─ renderer/src/
│  ├─ App.tsx               整体布局 + 全局事件分发
│  ├─ components/
│  │  ├─ layout/            标题栏、左侧连接侧栏、底部命令抽屉、状态栏
│  │  ├─ connections/       连接树、新建/编辑连接弹窗、标签管理弹窗
│  │  ├─ commands/          快捷命令卡片、命令历史、新建/编辑命令弹窗
│  │  ├─ downloads/         下载管理器面板
│  │  ├─ editor/            在线编辑器（CodeMirror）
│  │  ├─ sync/              配置同步对话框
│  │  ├─ terminal/          xterm 终端、标签页、实例注册表、配色
│  │  ├─ monitor/           服务器监控面板、迷你折线图
│  │  └─ sftp/              文件管理面板
│  ├─ store/useAppStore.ts  Zustand store
│  └─ utils/format.ts       字节 / 速率 / 时长格式化
└─ shared/                  三端共用的类型与常量
   ├─ types.ts              连接配置、会话事件、SFTP 条目、监控采样
   ├─ ipc.ts                IPC 频道名
   └─ api.ts                window.api 的接口定义
```

## 开发

```bash
npm install
npm run dev          # 开发模式，改代码热更新
npm test             # 单元测试（vitest）
npm run typecheck    # 主进程 + 渲染进程类型检查
npm run build        # 类型检查 + 打包到 out/
npm run pack:win     # 出 Windows 安装包到 release/
```

Node 24 / npm 11 下验证通过。

## 已实现

- 连接配置的增删改查、分组、搜索、导入导出（存 `%APPDATA%/SimpleShell/connections.json`）
- **连接标签**：给服务器打彩色标签，左侧按标签筛选；标签可新建、改名、点色块换色、删除（删除时会自动从连接上摘掉）
- 密码 / 私钥两种认证，支持 keyboard-interactive 回退、心跳保活
- 多标签终端：xterm.js + fit/search/web-links，窗口尺寸变化自动 `resize` 到远端
- **标签页操作**：拖拽排序、右键菜单（重命名 / 关闭 / 关闭其他 / 关闭右侧 / 关闭全部）、双击重命名、中键关闭、`Ctrl+Tab` 循环切换、`Ctrl+1..9` 跳转
- **快捷命令**：终端下方的命令抽屉（默认收起，`Ctrl+`` 展开），卡片式布局，点一下发到当前终端；支持搜索、新建/编辑/删除、`仅粘贴`（只填入不回车）；首次使用预置 6 条常用命令
- **命令历史**：自动记录终端里执行的命令，带主机、时间和来源；可搜索、点击重新执行、单条删除、一键清空；不回显的输入（如 sudo 密码）不会入历史；最多保留 500 条
- **下载管理器**：底部「下载」页签，队列最多同时 2 个任务；支持暂停 / 继续（断点续传）、取消、重试、打开所在文件夹、清空记录；同名文件自动加 `(1)`；关掉应用后已完成记录保留、未完成标记为已暂停
- **在线编辑**：文件列表里文本文件可直接打开编辑，CodeMirror 6 带行号、语法高亮、搜索；`Ctrl+S` 保存；保存走「临时文件 + 原子替换」，带 mtime 冲突检测；超过 2 MB 或二进制文件会拒绝
- **连接树右键菜单**：连接 / 编辑 / 复制 / 删除；空白处右键可新建连接
- **批量命令**：底部「批量命令」页签，勾选多个已就绪会话，一条命令同时下发
- **目录递归下载**：SFTP 里对目录点下载，会保留目录结构把所有文件排进下载队列
- **文件多选**：点工具栏「选择」进入批量选择模式（复选框 / `Ctrl` 点选 / `Shift` 连选），选中后可批量下载（只弹一次目录选择框）或批量删除
- **密码加密**：连接密码和私钥口令用 Electron `safeStorage`（Windows DPAPI）加密后落盘，不再明文存储
- **配置同步**：连接 / 标签 / 快捷命令打包成一个备份文件，用主密码（AES-256-GCM）加密后上传到本地文件夹（百度网盘同步空间、OneDrive 等）、WebDAV、FTP/FTPS 或 SFTP；换机器下载后用同一个主密码恢复，按 id 合并；可选配置变化后自动上传
- 服务器监控：CPU、内存、交换分区、磁盘、网速、负载、运行时长、进程数，带历史曲线
- SFTP 文件管理：浏览、进入目录、新建文件夹、重命名、删除（递归）、上传、下载、传输进度
- 自绘标题栏（无边框窗口）、深色主题

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 下一个 / 上一个标签页 |
| `Ctrl+1` … `Ctrl+9` | 跳到第 N 个标签页（超出数量则取最后一个） |
| `` Ctrl+` `` | 展开 / 收起底部命令抽屉 |
| `Ctrl+B` | 展开 / 收起左侧连接管理器 |
| 双击标签页标题 | 重命名标签页 |
| 鼠标中键点标签页 | 关闭该标签页 |
| 标签页上右键 | 重命名 / 关闭 / 关闭其他 / 关闭右侧 / 关闭全部 |

## 已知限制 / 待办

- **密码已用 `safeStorage` 加密落盘**；但「导出连接」生成的是明文 JSON（方便换机），导出文件要妥善保管
- 监控只支持 Linux 目标机（依赖 `/proc`），Windows / macOS 目标机待补
- 私钥路径目前是手输，还没做文件选择器
- 上传只支持文件，暂不支持整个目录递归上传
- 在线编辑按 UTF-8 读写，GBK 等其它编码会乱码；单文件上限 2 MB
- 配置同步的 WebDAV / FTP / SFTP 后端只做了基础实现，尚未在真实服务上逐一验证；本地文件夹方式已完整验证
- 同步主密码不会保存，忘记后备份文件无法恢复
- 命令历史靠解析键盘输入得到：Tab 补全的内容拿不到，用方向键翻旧命令时可能漏记；vim/top 这类全屏程序里的按键会被自动忽略
- 没设置 CSP，Electron 会在开发模式提示安全警告；打包前应补上严格的 `Content-Security-Policy`
- 端口转发、SFTP 拖拽上传等特性还没做

## 约定

- 主进程不做业务 UI 决策，渲染进程不直接碰 Node API，一切都走 `window.api`（见 `src/shared/api.ts`）
- 新增 IPC 频道时先在 `src/shared/ipc.ts` 登记，再在 `src/main/ipc/index.ts` 注册，最后在 preload 里转发
- 终端数据统一由 `App.tsx` 订阅一次，经 `terminalRegistry` 按 sessionId 分发，不要在每个终端里重复订阅
- 标签颜色从 `components/connections/tagColors.ts` 的调色板里取，新增颜色改这一处即可
- 删除标签时必须同时清理连接上的引用：主进程 `ConnectionStore.deleteTag` 负责，渲染进程 store 同步本地副本
