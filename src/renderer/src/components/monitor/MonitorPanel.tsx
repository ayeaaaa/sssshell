import { useAppStore } from '@renderer/store/useAppStore'
import { formatBytes, formatDuration, formatPercent, formatRate } from '@renderer/utils/format'
import { Sparkline } from './Sparkline'

/** 稳定的空数组引用，避免 selector 每次返回新对象导致重渲染 */
const EMPTY_HISTORY: never[] = []

interface Props {
  sessionId: string
  connected: boolean
}

/** 右侧监控面板：CPU / 内存 / 磁盘 / 网络 / 负载 */
export function MonitorPanel({ sessionId, connected }: Props) {
  const history = useAppStore((s) => s.samples[sessionId]) ?? EMPTY_HISTORY
  const sample = history.at(-1)

  if (!connected) {
    return <Placeholder text="会话就绪后自动开始采集" />
  }
  if (!sample) {
    return <Placeholder text="正在读取服务器状态…" />
  }

  const memPercent = sample.memTotal > 0 ? (sample.memUsed / sample.memTotal) * 100 : 0
  const swapPercent = sample.swapTotal > 0 ? (sample.swapUsed / sample.swapTotal) * 100 : 0
  const diskPercent = sample.diskTotal > 0 ? (sample.diskUsed / sample.diskTotal) * 100 : 0
  const netMax = Math.max(...history.map((s) => Math.max(s.netRxRate, s.netTxRate)), 1024)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <section className="rounded border border-shell-600 bg-shell-800/60 p-3">
        <Header label="CPU 使用率" value={formatPercent(sample.cpuUsage)} />
        <Bar percent={sample.cpuUsage} color="#3d9be9" />
        <Sparkline values={history.map((s) => s.cpuUsage)} max={100} color="#3d9be9" />
        <div className="mt-1 flex justify-between text-[11px] text-shell-400">
          <span>负载 {sample.loadAverage.map((v) => v.toFixed(2)).join(' / ')}</span>
          <span>{sample.processCount} 进程</span>
        </div>
      </section>

      <section className="rounded border border-shell-600 bg-shell-800/60 p-3">
        <Header
          label="内存"
          value={`${formatBytes(sample.memUsed)} / ${formatBytes(sample.memTotal)}`}
        />
        <Bar percent={memPercent} color="#4ec26a" />

        <div className="mt-3">
          <Header
            label="交换分区"
            value={sample.swapTotal > 0 ? `${formatBytes(sample.swapUsed)} / ${formatBytes(sample.swapTotal)}` : '未启用'}
          />
          <Bar percent={swapPercent} color="#e0a336" />
        </div>

        <div className="mt-3">
          <Header
            label="磁盘"
            value={`${formatBytes(sample.diskUsed)} / ${formatBytes(sample.diskTotal)}`}
          />
          <Bar percent={diskPercent} color="#b478e0" />
        </div>
      </section>

      <section className="rounded border border-shell-600 bg-shell-800/60 p-3">
        <Header
          label="网络"
          value={`↓ ${formatRate(sample.netRxRate)}  ↑ ${formatRate(sample.netTxRate)}`}
        />
        <Sparkline values={history.map((s) => s.netRxRate)} max={netMax} color="#43c7c7" />
        <Sparkline values={history.map((s) => s.netTxRate)} max={netMax} color="#e0a336" />
      </section>

      <section className="rounded border border-shell-600 bg-shell-800/60 p-3">
        <Header label="运行时长" value={formatDuration(sample.uptimeSeconds)} />
        <p className="mt-1 text-[11px] text-shell-400">
          采样时间 {new Date(sample.timestamp).toLocaleTimeString('zh-CN')}
        </p>
      </section>
    </div>
  )
}

function Header({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[12px] text-shell-300">{label}</span>
      <span className="truncate font-mono text-[11px] text-shell-200">{value}</span>
    </div>
  )
}

function Bar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-shell-600">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color }}
      />
    </div>
  )
}

function Placeholder({ text }: { text: string }) {
  return <p className="p-4 text-center text-[12px] text-shell-400">{text}</p>
}
