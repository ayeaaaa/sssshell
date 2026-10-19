import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { registerTerminal, unregisterTerminal } from './terminalRegistry'
import { terminalFontFamily, terminalTheme } from './theme'

interface Props {
  sessionId: string
  /** 只有激活的标签页才做 fit，隐藏状态下容器尺寸为 0 */
  active: boolean
}

/**
 * 一个 xterm.js 终端，绑定到一个 SSH 会话。
 * 键盘输入 -> ssh.write，窗口尺寸变化 -> ssh.resize。
 */
export function TerminalPane({ sessionId, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal({
      fontFamily: terminalFontFamily,
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10_000,
      theme: terminalTheme,
      allowProposedApi: true,
      macOptionIsMeta: true
    })

    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(new SearchAddon())
    terminal.loadAddon(new WebLinksAddon())

    terminal.open(container)
    terminalRef.current = terminal
    fitRef.current = fit
    registerTerminal(sessionId, terminal)

    const inputSubscription = terminal.onData((data) => window.api.ssh.write(sessionId, data))
    const resizeObserver = new ResizeObserver(() => {
      // 隐藏时 clientWidth 为 0，fit 会算出 0 列，这里跳过
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      fit.fit()
      window.api.ssh.resize(sessionId, terminal.cols, terminal.rows)
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      inputSubscription.dispose()
      unregisterTerminal(sessionId)
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [sessionId])

  // 切换标签页后重新适配尺寸
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    const terminal = terminalRef.current
    const fit = fitRef.current
    if (!container || !terminal || !fit) return

    const timer = window.setTimeout(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      fit.fit()
      window.api.ssh.resize(sessionId, terminal.cols, terminal.rows)
      terminal.focus()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [active, sessionId])

  return (
    <div
      ref={containerRef}
      data-session-id={sessionId}
      className="h-full w-full overflow-hidden bg-shell-900"
    />
  )
}
