import { readFileSync } from 'node:fs'
import type { EventEmitter } from 'node:events'
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2'
import type { CommandRecord, SshConnectOptions, SshSessionState } from '@shared/types'

export interface SshSessionEvents {
  onData: (sessionId: string, data: string) => void
  onState: (sessionId: string, state: SshSessionState, message?: string) => void
  onExit: (sessionId: string, code: number | null, signal?: string) => void
  /** 识别出一条完整命令（已过滤掉不回显的输入） */
  onCommand: (record: CommandRecord) => void
}

/**
 * 单个 SSH 会话：负责建立连接、开 shell、转发数据、执行一次性命令。
 * 一个 SshSession 对应界面上一个标签页。
 */
export class SshSession {
  readonly id: string
  private readonly client = new Client()
  private readonly options: SshConnectOptions
  private readonly events: SshSessionEvents
  private stream: ClientChannel | null = null
  private sftp: SFTPWrapper | null = null
  private state: SshSessionState = 'connecting'
  private disposed = false
  private exitEmitted = false
  /** 当前正在输入的一行（用于命令历史） */
  private inputBuffer = ''
  /** 最近一段输出（去掉 ANSI 转义），用来判断命令是否被回显 */
  private recentOutput = ''
  /** 是否处于 vim / top 这类备用屏幕，避免把 TUI 按键记成命令 */
  private altScreen = false

  constructor(options: SshConnectOptions, events: SshSessionEvents) {
    this.id = options.sessionId
    this.options = options
    this.events = events
  }

  getState(): SshSessionState {
    return this.state
  }

  /** 展示用：user@host */
  get label(): string {
    return `${this.options.username}@${this.options.host}`
  }

  connect(): void {
    this.client
      .on('ready', () => this.openShell())
      .on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        // 有些服务器只开 keyboard-interactive，这里把密码填给第一个提示
        finish(prompts.map(() => this.options.password ?? ''))
      })
      .on('error', (err: Error) => {
        this.setState('error', err.message)
      })

    // @types/ssh2 没声明 close 的参数，按 Node EventEmitter 的签名处理
    ;(this.client as unknown as EventEmitter).on(
      'close',
      (hadError: boolean, code: number, signal: string) => {
        if (this.state !== 'error') {
          const detail = hadError
            ? `连接异常关闭（code ${code}${signal ? ` / ${signal}` : ''}）`
            : '连接已关闭'
          this.setState('closed', detail)
        }
        this.emitExit(null)
        this.dispose()
      }
    )

    this.client.connect(this.buildConnectConfig())
  }

  private buildConnectConfig(): ConnectConfig {
    const o = this.options
    const config: ConnectConfig = {
      host: o.host,
      port: o.port > 0 ? o.port : 22,
      username: o.username,
      readyTimeout: 20_000,
      keepaliveInterval: o.keepaliveInterval > 0 ? o.keepaliveInterval * 1000 : 0,
      keepaliveCountMax: 3
    }

    if (o.authMethod === 'privateKey') {
      if (!o.privateKeyPath) throw new Error('未配置私钥路径')
      config.privateKey = readFileSync(o.privateKeyPath)
      if (o.privateKeyPassphrase) config.passphrase = o.privateKeyPassphrase
    } else {
      config.password = o.password ?? ''
      config.tryKeyboard = true
    }

    return config
  }

  private openShell(): void {
    const { cols, rows } = this.options
    this.client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) {
        this.setState('error', err.message)
        return
      }

      this.stream = stream
      stream.on('data', (chunk: Buffer) => this.handleOutput(chunk))
      stream.stderr.on('data', (chunk: Buffer) => this.handleOutput(chunk))
      stream.on('close', () => {
        if (this.state === 'ready') this.setState('closed', '远端关闭了 Shell')
        this.emitExit(null)
        this.dispose()
      })

      this.setState('ready')
    })
  }

  write(data: string, source: 'terminal' | 'quick' = 'terminal'): void {
    if (!this.stream) return
    this.stream.write(data)
    this.trackInput(data, source)
  }

  resize(cols: number, rows: number): void {
    // setWindow 在某些通道实现里会抛错，忽略即可
    try {
      this.stream?.setWindow(rows, cols, 0, 0)
    } catch {
      /* noop */
    }
  }

  /** 执行一条命令并收集完整输出（监控采样、读取 /proc 等使用） */
  exec(command: string, timeoutMs = 15_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('命令执行超时')), timeoutMs)
      this.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          reject(err)
          return
        }
        let out = ''
        stream.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8')
        })
        stream.stderr.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8')
        })
        stream.on('close', () => {
          clearTimeout(timer)
          resolve(out)
        })
      })
    })
  }

  /** 懒加载 SFTP 子系统，同一个 SSH 连接复用 */
  getSftp(): Promise<SFTPWrapper> {
    if (this.sftp) return Promise.resolve(this.sftp)
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }
        this.sftp = sftp
        resolve(sftp)
      })
    })
  }

  /** 输出统一走这里：转发给渲染进程，同时留一份用于判断命令是否被回显 */
  private handleOutput(chunk: Buffer): void {
    const text = chunk.toString('utf8')
    this.events.onData(this.id, text)

    if (text.includes('\x1b[?1049h')) this.altScreen = true
    if (text.includes('\x1b[?1049l')) this.altScreen = false

    this.recentOutput = (this.recentOutput + stripAnsi(text)).slice(-8192)
  }

  /** 解析键盘输入，攒出一条完整命令行 */
  private trackInput(data: string, source: 'terminal' | 'quick'): void {
    let i = 0
    while (i < data.length) {
      const char = data[i]

      if (char === '\x1b') {
        // 跳过 CSI / SS3 转义序列（方向键、功能键、括号粘贴标记等）
        if (data[i + 1] === '[') {
          i += 2
          while (i < data.length && !/[A-Za-z~]/.test(data[i])) i += 1
          i += 1
        } else if (data[i + 1] === 'O') {
          i += 3
        } else {
          i += 2
        }
        continue
      }

      if (char === '\r' || char === '\n') {
        this.commitInput(source)
      } else if (char === '\x7f' || char === '\b') {
        this.inputBuffer = this.inputBuffer.slice(0, -1)
      } else if (char === '\x03' || char === '\x15') {
        // Ctrl+C 取消 / Ctrl+U 清行
        this.inputBuffer = ''
      } else if (char === '\t') {
        // Tab 补全的结果拿不到，忽略这一次按键
      } else if (char >= ' ') {
        this.inputBuffer += char
      }

      i += 1
    }
  }

  private commitInput(source: 'terminal' | 'quick'): void {
    const command = this.inputBuffer.trim()
    this.inputBuffer = ''
    if (!command || this.altScreen) return

    const record: CommandRecord = {
      sessionId: this.id,
      command,
      host: this.options.host,
      username: this.options.username,
      source
    }

    // 等回显到达后再判断：sudo 密码这类不回显的输入不会被记进历史
    setTimeout(() => {
      if (this.disposed || !this.recentOutput.includes(command)) return
      this.events.onCommand(record)
    }, 300)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stream = null
    this.sftp = null
    this.client.end()
  }

  private setState(state: SshSessionState, message?: string): void {
    this.state = state
    this.events.onState(this.id, state, message)
  }

  private emitExit(code: number | null, signal?: string): void {
    if (this.exitEmitted) return
    this.exitEmitted = true
    this.events.onExit(this.id, code, signal)
  }
}

/** 去掉 ANSI 转义，方便在输出里查找命令原文 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
