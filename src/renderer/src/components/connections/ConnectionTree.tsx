import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

interface Props {
  onEdit: (config: ConnectionConfig) => void
  onCreate: () => void
}

/** 左侧连接树：按 group 分组，支持关键字搜索 + 标签筛选，点击即发起连接 */
export function ConnectionTree({ onEdit, onCreate }: Props) {
  const connections = useAppStore((s) => s.connections)
  const tags = useAppStore((s) => s.tags)
  const activeTagId = useAppStore((s) => s.activeTagId)
  const setActiveTagFilter = useAppStore((s) => s.setActiveTagFilter)
  const openConnection = useAppStore((s) => s.openConnection)
  const deleteConnection = useAppStore((s) => s.deleteConnection)
  const duplicateConnection = useAppStore((s) => s.duplicateConnection)
  const [keyword, setKeyword] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; config: ConnectionConfig | null } | null>(
    null
  )

  // 右键菜单：点别处或按 Esc 关闭
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  const groups = useMemo(() => {
    const lower = keyword.trim().toLowerCase()
    const filtered = connections.filter((c) => {
      if (activeTagId && !c.tags.includes(activeTagId)) return false
      if (!lower) return true
      return [c.name, c.host, c.username, c.group].some((field) => field?.toLowerCase().includes(lower))
    })

    const map = new Map<string, ConnectionConfig[]>()
    for (const item of filtered) {
      const key = item.group?.trim() || '默认分组'
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [connections, keyword, activeTagId])

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

      {tags.length > 0 && (
        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto px-2 pb-1.5">
          <FilterChip label="全部" active={activeTagId === null} onClick={() => setActiveTagFilter(null)} />
          {tags.map((tag) => (
            <FilterChip
              key={tag.id}
              label={tag.name}
              color={tag.color}
              active={activeTagId === tag.id}
              onClick={() => setActiveTagFilter(activeTagId === tag.id ? null : tag.id)}
            />
          ))}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, config: null })
        }}
      >
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-shell-400">
            {connections.length === 0 ? (
              <>
                还没有连接
                <br />
                点右上角 ＋ 添加一台服务器
              </>
            ) : (
              '没有匹配的连接'
            )}
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
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setMenu({ x: event.clientX, y: event.clientY, config })
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void openConnection(config)}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left text-[12px] text-shell-200"
                    title={`${config.username}@${config.host}:${config.port}`}
                  >
                    <span className="shrink-0 text-ok">●</span>
                    <span className="truncate">{config.name || `${config.username}@${config.host}`}</span>
                    {config.tags.length > 0 && (
                      <span className="ml-0.5 flex shrink-0 items-center gap-0.5">
                        {config.tags.slice(0, 3).map((tagId) => {
                          const tag = tagMap.get(tagId)
                          if (!tag) return null
                          return (
                            <span
                              key={tagId}
                              title={tag.name}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                          )
                        })}
                      </span>
                    )}
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

      {menu && (
        <div
          className="fixed z-50 min-w-[136px] rounded border border-shell-600 bg-shell-700 py-1 text-[12px] text-shell-200 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {menu.config ? (
            <>
              <ContextItem
                onClick={() => {
                  void openConnection(menu.config!)
                  setMenu(null)
                }}
              >
                连接
              </ContextItem>
              <ContextItem
                onClick={() => {
                  onEdit(menu.config!)
                  setMenu(null)
                }}
              >
                编辑
              </ContextItem>
              <ContextItem
                onClick={() => {
                  void duplicateConnection(menu.config!.id)
                  setMenu(null)
                }}
              >
                复制
              </ContextItem>
              <div className="my-1 border-t border-shell-600" />
              <ContextItem
                danger
                onClick={() => {
                  void deleteConnection(menu.config!.id)
                  setMenu(null)
                }}
              >
                删除
              </ContextItem>
            </>
          ) : (
            <ContextItem
              onClick={() => {
                onCreate()
                setMenu(null)
              }}
            >
              新建连接
            </ContextItem>
          )}
        </div>
      )}
    </div>
  )
}

function ContextItem({
  children,
  onClick,
  danger
}: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-1 text-left transition-colors hover:bg-accent-600 hover:text-white ${
        danger ? 'text-danger' : ''
      }`}
    >
      {children}
    </button>
  )
}

function FilterChip({
  label,
  color,
  active,
  onClick
}: {
  label: string
  color?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors"
      style={
        active
          ? {
              borderColor: color ?? '#3d9be9',
              color: color ?? '#5fb0f0',
              backgroundColor: `${color ?? '#3d9be9'}22`
            }
          : { borderColor: '#2b3038', color: '#7c8593' }
      }
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  )
}
