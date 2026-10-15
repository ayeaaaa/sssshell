import type { MonitorSample } from '@shared/types'
import type { SessionManager } from '../ssh/SessionManager'

/** 一次采样需要的全部信息，用标记分段方便解析 */
const SAMPLE_COMMAND = [
  "echo '@@@STAT'; head -n1 /proc/stat",
  "echo '@@@MEM'; cat /proc/meminfo",
  "echo '@@@LOAD'; cat /proc/loadavg",
  "echo '@@@UPTIME'; cat /proc/uptime",
  "echo '@@@DF'; df -kP",
  "echo '@@@NET'; cat /proc/net/dev",
  "echo '@@@PROC'; ls -d /proc/[0-9]* 2>/dev/null | wc -l"
].join('; ')

interface RawCounters {
  cpuTotal: number
  cpuIdle: number
  netRx: number
  netTx: number
  timestamp: number
}

/**
 * 服务器监控：周期性在目标机器上执行一段脚本，解析 /proc 数据。
 * 只支持 Linux；Windows / macOS 目标后续再补。
 */
export class MonitorService {
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly lastCounters = new Map<string, RawCounters>()

  constructor(
    private readonly sessions: SessionManager,
    private readonly onSample: (sample: MonitorSample) => void,
    private readonly intervalMs = 2000
  ) {}

  start(sessionId: string): void {
    this.stop(sessionId)
    void this.tick(sessionId)
    const timer = setInterval(() => void this.tick(sessionId), this.intervalMs)
    this.timers.set(sessionId, timer)
  }

  stop(sessionId: string): void {
    const timer = this.timers.get(sessionId)
    if (timer) clearInterval(timer)
    this.timers.delete(sessionId)
    this.lastCounters.delete(sessionId)
  }

  stopAll(): void {
    for (const id of [...this.timers.keys()]) this.stop(id)
  }

  private async tick(sessionId: string): Promise<void> {
    try {
      const output = await this.sessions.exec(sessionId, SAMPLE_COMMAND, 8000)
      const sample = this.parse(sessionId, output)
      if (sample) this.onSample(sample)
    } catch {
      // 采样失败（例如断线）时静默跳过，避免刷屏
    }
  }

  private parse(sessionId: string, output: string): MonitorSample | null {
    const sections = splitSections(output)
    const stat = sections.get('STAT')
    const mem = sections.get('MEM')
    if (!stat || !mem) return null

    const now = Date.now()
    const prev = this.lastCounters.get(sessionId)

    // ---- CPU ----
    const cpuFields = stat.trim().split(/\s+/).slice(1).map(Number)
    const cpuTotal = cpuFields.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
    const cpuIdle = (cpuFields[3] ?? 0) + (cpuFields[4] ?? 0)

    let cpuUsage = 0
    if (prev) {
      const totalDelta = cpuTotal - prev.cpuTotal
      const idleDelta = cpuIdle - prev.cpuIdle
      if (totalDelta > 0) cpuUsage = clamp(((totalDelta - idleDelta) / totalDelta) * 100, 0, 100)
    }

    // ---- 内存 ----
    const memMap = parseMemInfo(mem)
    const memTotal = (memMap.get('MemTotal') ?? 0) * 1024
    const memAvailable = (memMap.get('MemAvailable') ?? memMap.get('MemFree') ?? 0) * 1024
    const swapTotal = (memMap.get('SwapTotal') ?? 0) * 1024
    const swapFree = (memMap.get('SwapFree') ?? 0) * 1024

    // ---- 负载 / 运行时长 / 进程数 ----
    const loadFields = (sections.get('LOAD') ?? '').trim().split(/\s+/).map(Number)
    const uptimeSeconds = Number.parseFloat(sections.get('UPTIME') ?? '0') || 0
    const processCount = Number.parseInt((sections.get('PROC') ?? '0').trim(), 10) || 0

    // ---- 磁盘 ----
    const disk = parseDf(sections.get('DF') ?? '')

    // ---- 网络 ----
    const net = parseNetDev(sections.get('NET') ?? '')
    let netRxRate = 0
    let netTxRate = 0
    if (prev && now > prev.timestamp) {
      const seconds = (now - prev.timestamp) / 1000
      netRxRate = Math.max(0, (net.rx - prev.netRx) / seconds)
      netTxRate = Math.max(0, (net.tx - prev.netTx) / seconds)
    }

    this.lastCounters.set(sessionId, {
      cpuTotal,
      cpuIdle,
      netRx: net.rx,
      netTx: net.tx,
      timestamp: now
    })

    return {
      sessionId,
      timestamp: now,
      cpuUsage,
      memTotal,
      memUsed: Math.max(0, memTotal - memAvailable),
      swapTotal,
      swapUsed: Math.max(0, swapTotal - swapFree),
      diskTotal: disk.total,
      diskUsed: disk.used,
      netRxRate,
      netTxRate,
      uptimeSeconds,
      loadAverage: [loadFields[0] ?? 0, loadFields[1] ?? 0, loadFields[2] ?? 0],
      processCount
    }
  }
}

function splitSections(output: string): Map<string, string> {
  const sections = new Map<string, string>()
  let current = ''
  let buffer: string[] = []

  const flush = (): void => {
    if (current) sections.set(current, buffer.join('\n'))
  }

  for (const line of output.split(/\r?\n/)) {
    const marker = /^@@@(\w+)$/.exec(line.trim())
    if (marker) {
      flush()
      current = marker[1]
      buffer = []
      continue
    }
    buffer.push(line)
  }
  flush()
  return sections
}

function parseMemInfo(raw: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(\w+):\s+(\d+)/.exec(line.trim())
    if (match) map.set(match[1], Number.parseInt(match[2], 10))
  }
  return map
}

function parseDf(raw: string): { total: number; used: number } {
  let total = 0
  let used = 0

  for (const line of raw.split(/\r?\n/).slice(1)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length < 6) continue
    const [filesystem, blocks, usedBlocks] = fields
    // 只统计真实块设备，避免 tmpfs / overlay 重复累加
    if (!filesystem.startsWith('/dev/')) continue
    total += Number.parseInt(blocks, 10) * 1024 || 0
    used += Number.parseInt(usedBlocks, 10) * 1024 || 0
  }

  return { total, used }
}

function parseNetDev(raw: string): { rx: number; tx: number } {
  let rx = 0
  let tx = 0

  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([^:]+):\s*(.+)$/.exec(line)
    if (!match) continue
    const iface = match[1].trim()
    if (iface === 'lo') continue
    const fields = match[2].trim().split(/\s+/).map(Number)
    rx += fields[0] || 0
    tx += fields[8] || 0
  }

  return { rx, tx }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
