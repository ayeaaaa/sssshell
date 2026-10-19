import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SshSessionState } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import type { DropPosition } from '@renderer/store/useAppStore'

const stateColor: Record<SshSessionState, string> = {
  connecting: 'bg-warn',
  ready: 'bg-ok',
  closed: 'bg-shell-400',
  error: 'bg-danger'
}

interface MenuState {
  x: number
  y: number
  tabId: string
}

interface DropTarget {
  id: string
  position: DropPosition
}

export function TerminalTabs() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useAppStore((s) => s.closeTabsToRight)
  const closeAllTabs = useAppStore((s) => s.closeAllTabs)
  const moveTab = useAppStore((s) => s.moveTab)
  const renameTab = useAppStore((s) => s.renameTab)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const draggingId = useRef<string | null>(null)

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

  if (tabs.length === 0) return null

  const startRename = (tabId: string, current: string): void => {
    setMenu(null)
    setRenamingId(tabId)
    setRenameValue(current)
  }

  const commitRename = (): void => {
    if (renamingId) renameTab(renamingId, renameValue)
    setRenamingId(null)
  }

  return (
    <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-shell-700 bg-shell-900">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        const dropping = dropTarget?.id === tab.id
        return (
          <div
            key={tab.id}
            draggable={renamingId !== tab.id}
            onDragStart={(event) => {
              draggingId.current = tab.id
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', tab.id)
            }}
            onDragOver={(event) => {
              if (!draggingId.current || draggingId.current === tab.id) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const rect = event.currentTarget.getBoundingClientRect()
              const position: DropPosition =
                event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
              setDropTarget((prev) =>
                prev?.id === tab.id && prev.position === position ? prev : { id: tab.id, position }
              )
            }}
            onDragLeave={() => setDropTarget((prev) => (prev?.id === tab.id ? null : prev))}
            onDrop={(event) => {
              event.preventDefault()
              const dragged = draggingId.current
              if (dragged && dragged !== tab.id) {
                const rect = event.currentTarget.getBoundingClientRect()
                const position: DropPosition =
                  event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
                moveTab(dragged, tab.id, position)
              }
              draggingId.current = null
              setDropTarget(null)
            }}
            onDragEnd={() => {
              draggingId.current = null
              setDropTarget(null)
            }}
            onAuxClick={(event) => {
              if (event.button === 1) void closeTab(tab.id)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, tabId: tab.id })
            }}
            className={`group flex max-w-[200px] shrink-0 items-center gap-2 border-r border-shell-700 px-3 text-[12px] ${
              active ? 'bg-shell-800 text-shell-200' : 'text-shell-300 hover:bg-shell-700/60'
            } ${dropping && dropTarget.position === 'before' ? 'border-l-2 border-l-accent-500' : ''} ${
              dropping && dropTarget.position === 'after' ? 'border-r-2 border-r-accent-500' : ''
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateColor[tab.state]}`} />

            {renamingId === tab.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename()
                  if (event.key === 'Escape') setRenamingId(null)
                }}
                className="h-5 w-[110px] rounded border border-accent-600 bg-shell-900 px-1 text-[12px] text-shell-200 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                onDoubleClick={() => startRename(tab.id, tab.title)}
                className="min-w-0 flex-1 truncate text-left"
                title={tab.message ?? `${tab.username}@${tab.host}`}
              >
                {tab.title}
              </button>
            )}

            <button
              type="button"
              title="关闭标签页"
              onClick={() => void closeTab(tab.id)}
              className="shrink-0 text-shell-400 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )
      })}

      {menu && (
        <div
          className="fixed z-50 min-w-[136px] rounded border border-shell-600 bg-shell-700 py-1 text-[12px] text-shell-200 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <MenuItem
            onClick={() => {
              const tab = tabs.find((t) => t.id === menu.tabId)
              if (tab) startRename(tab.id, tab.title)
            }}
          >
            重命名
          </MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => void closeTab(menu.tabId)}>关闭</MenuItem>
          <MenuItem
            disabled={tabs.length <= 1}
            onClick={() => void closeOtherTabs(menu.tabId)}
          >
            关闭其他
          </MenuItem>
          <MenuItem
            disabled={tabs.findIndex((t) => t.id === menu.tabId) === tabs.length - 1}
            onClick={() => void closeTabsToRight(menu.tabId)}
          >
            关闭右侧
          </MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => void closeAllTabs()}>关闭全部</MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className="block w-full px-3 py-1 text-left transition-colors hover:bg-accent-600 hover:text-white disabled:cursor-default disabled:text-shell-400 disabled:hover:bg-transparent disabled:hover:text-shell-400"
    >
      {children}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 border-t border-shell-600" />
}
