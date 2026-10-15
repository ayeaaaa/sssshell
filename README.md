# SSH Terminal

FinalShell 风格的 Windows SSH / SFTP 客户端。目标是把 FinalShell 那套「连接树 + 多标签终端 + 服务器监控 + 文件管理」的体验，用 Web 技术栈重做一遍。

当前是**可运行的骨架**：能连服务器、开交互式 Shell、看监控、传文件。细节功能还在补齐，路线见 [docs/ROADMAP.md](docs/ROADMAP.md)。

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
│  ├─ sftp/SftpService.ts   目录浏览、增删改、上传下载
│  ├─ monitor/MonitorService.ts  解析 /proc 得到 CPU / 内存 / 磁盘 / 网络
│  └─ store/connectionStore.ts   连接配置持久化（userData/connections.json）
├─ preload/index.ts         暴露 window.api，渲染进程只拿得到这些方法
├─ renderer/src/
│  ├─ App.tsx               整体布局 + 全局事件分发
│  ├─ components/
│  │  ├─ layout/            标题栏、左侧连接侧栏、状态栏
│  │  ├─ connections/       连接树、新建/编辑连接弹窗
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
npm run typecheck    # 主进程 + 渲染进程类型检查
npm run build        # 类型检查 + 打包到 out/
npm run pack:win     # 出 Windows 安装包到 release/
```

Node 24 / npm 11 下验证通过。

## 已实现

- 连接配置的增删改查、分组、搜索、导入导出（存 `%APPDATA%/ssh-terminal/connections.json`）
- 密码 / 私钥两种认证，支持 keyboard-interactive 回退、心跳保活
- 多标签终端：xterm.js + fit/search/web-links，窗口尺寸变化自动 `resize` 到远端
- 服务器监控：CPU、内存、交换分区、磁盘、网速、负载、运行时长、进程数，带历史曲线
- SFTP 文件管理：浏览、进入目录、新建文件夹、重命名、删除（递归）、上传、下载、传输进度
- 自绘标题栏（无边框窗口）、深色主题

## 已知限制 / 待办

- **密码是明文存在 JSON 里**，后续要接 Electron `safeStorage`（Windows 走 DPAPI）
- 监控只支持 Linux 目标机（依赖 `/proc`），Windows / macOS 目标机待补
- 私钥路径目前是手输，还没做文件选择器
- 上传只支持文件，暂不支持整个目录递归上传
- 没设置 CSP，Electron 会在开发模式提示安全警告；打包前应补上严格的 `Content-Security-Policy`
- 端口转发、SFTP 拖拽上传、命令快捷面板、批量命令下发等 FinalShell 特性还没做

## 约定

- 主进程不做业务 UI 决策，渲染进程不直接碰 Node API，一切都走 `window.api`（见 `src/shared/api.ts`）
- 新增 IPC 频道时先在 `src/shared/ipc.ts` 登记，再在 `src/main/ipc/index.ts` 注册，最后在 preload 里转发
- 终端数据统一由 `App.tsx` 订阅一次，经 `terminalRegistry` 按 sessionId 分发，不要在每个终端里重复订阅
