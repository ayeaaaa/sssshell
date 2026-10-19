import type { Terminal } from '@xterm/xterm'

/**
 * 终端实例注册表。
 *
 * SSH 数据是主进程广播给所有窗口的，每个 TerminalPane 自己过滤 sessionId 会重复订阅；
 * 这里让 App 只订阅一次，再按 sessionId 分发到对应终端。
 */
const terminals = new Map<string, Terminal>()

export function registerTerminal(sessionId: string, terminal: Terminal): void {
  terminals.set(sessionId, terminal)
}

export function unregisterTerminal(sessionId: string): void {
  terminals.delete(sessionId)
}

export function writeToTerminal(sessionId: string, data: string): void {
  terminals.get(sessionId)?.write(data)
}

/** 在终端里插一行本地提示（连接状态、错误等），不影响远端输出 */
export function writeLocalNotice(sessionId: string, text: string, color = '\x1b[38;2;124;133;147m'): void {
  terminals.get(sessionId)?.write(`\r\n${color}${text}\x1b[0m\r\n`)
}

export function clearTerminal(sessionId: string): void {
  terminals.get(sessionId)?.clear()
}

export function focusTerminal(sessionId: string): void {
  terminals.get(sessionId)?.focus()
}
