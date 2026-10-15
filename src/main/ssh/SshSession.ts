import { readFileSync } from 'node:fs'
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2'
import type { SshConnectOptions, SshSessionState } from '@shared/types'

export interface SshSessionEvents {
  onData: (sessionId: string, data: string) => void
  onState: (sessionId: string, state: SshSessionState, message?: string) => void
  onExit: (sessionId: string, code: number | null, signal?: string) => void
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

  constructor(options: SshConnectOptions, events: SshSessionEvents) {
    this.id = options.sessionId
    this.options = options
    this.events = events
  }

  getState(): SshSessionState {
    return this.state
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
      .on('close', () => {
        if (this.state !== 'error') this.setState('closed')
        this.emitExit(null)
        this.dispose()
      })
      .connect(this.buildConnectConfig())
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
      stream.on('data', (chunk: Buffer) => this.events.onData(this.id, chunk.toString('utf8')))
      stream.stderr.on('data', (chunk: Buffer) => this.events.onData(this.id, chunk.toString('utf8')))
      stream.on('close', () => {
        this.emitExit(null)
        this.dispose()
      })

      this.setState('ready')
    })
  }

  write(data: string): void {
    this.stream?.write(data)
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
