import { useMemo, useState } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

interface Props {
  onEdit: (config: ConnectionConfig) => void
  onCreate: () => void
}

/** 左侧连接树：按 group 分组，点击即发起连接 */
export function ConnectionTree({ onEdit, onCreate }: Props) {
  const connections = useAppStore((s) => s.connections)
  const openConnection = useAppStore((s) => s.openConnection)
  const deleteConnection = useAppStore((s) => s.deleteConnection)
  const [keyword, setKeyword] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const lower = keyword.trim().toLowerCase()
    const filtered = lower
      ? connections.filter((c) =>
          [c.name, c.host, c.username, c.group].some((field) => field?.toLowerCase().includes(lower))
        )
      : connections

    const map = new Map<string, ConnectionConfig[]>()
    for (const item of filtered) {
      const key = item.group?.trim() || '默认分组'
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [connections, keyword])

  const toggleGroup = (name: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-2 py-2">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索连接…"
          className="h-7 min-w-0 flex-1 rounded border border-shell-600 bg-shell-900 px-2 text-[12px] text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={onCreate}
          title="新建连接"
          className="h-7 shrink-0 rounded bg-accent-600 px-2 text-[12px] text-white transition-colors hover:bg-accent-500"
        >
          ＋
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-shell-400">
            还没有连接
            <br />
            点右上角 ＋ 添加一台服务器
          </p>
        )}

        {groups.map(([group, items]) => (
          <div key={group} className="mb-1">
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[12px] text-shell-300 hover:bg-shell-700"
            >
              <span className="w-3 text-shell-400">{collapsed.has(group) ? '▸' : '▾'}</span>
              <span className="truncate font-medium">{group}</span>
              <span className="text-shell-400">({items.length})</span>
            </button>

            {!collapsed.has(group) &&
              items.map((config) => (
                <div
                  key={config.id}
                  className="group flex items-center gap-1 rounded py-1 pl-5 pr-1 hover:bg-shell-700"
                >
                  <button
                    type="button"
                    onClick={() => void openConnection(config)}
                    className="min-w-0 flex-1 truncate text-left text-[12px] text-shell-200"
                    title={`${config.username}@${config.host}:${config.port}`}
                  >
                    <span className="mr-1 text-ok">●</span>
                    {config.name || `${config.username}@${config.host}`}
                  </button>

                  <button
                    type="button"
                    title="编辑"
                    onClick={() => onEdit(config)}
                    className="hidden shrink-0 px-1 text-shell-300 hover:text-accent-400 group-hover:block"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title="删除"
                    onClick={() => void deleteConnection(config.id)}
                    className="hidden shrink-0 px-1 text-shell-300 hover:text-danger group-hover:block"
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
