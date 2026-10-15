interface Props {
  values: number[]
  color: string
  height?: number
  /** 固定上限，留空按数据最大值自适应 */
  max?: number
  fill?: boolean
}

/** 极简折线图，用于 CPU / 网络速率曲线 */
export function Sparkline({ values, color, height = 44, max, fill = true }: Props) {
  if (values.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-[11px] text-shell-400">
        采样中…
      </div>
    )
  }

  const width = 100
  const top = max ?? Math.max(...values, 1)
  const step = width / (values.length - 1)

  const points = values.map((value, index) => {
    const x = index * step
    const y = height - (Math.min(value, top) / top) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const line = points.join(' ')
  const area = `0,${height} ${line} ${width},${height}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
    >
      {fill && <polygon points={area} fill={color} opacity={0.16} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
