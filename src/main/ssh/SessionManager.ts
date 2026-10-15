import type { SshConnectOptions } from '@shared/types'
import { SshSession } from './SshSession'
import type { SshSessionEvents } from './SshSession'

/**
 * 管理所有活跃 SSH 会话。主进程内单例使用。
 */
export class SessionManager {
  private readonly sessions = new Map<string, SshSession>()

  constructor(private readonly events: SshSessionEvents) {}

  connect(options: SshConnectOptions): void {
    this.disconnect(options.sessionId)
    const session = new SshSession(options, this.events)
    this.sessions.set(options.sessionId, session)
    session.connect()
  }

  get(sessionId: string): SshSession | undefined {
    return this.sessions.get(sessionId)
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.resize(cols, rows)
  }

  exec(sessionId: string, command: string, timeoutMs?: number): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) return Promise.reject(new Error('会话不存在或已断开'))
    return session.exec(command, timeoutMs)
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    session.dispose()
  }

  disconnectAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
  }
}
