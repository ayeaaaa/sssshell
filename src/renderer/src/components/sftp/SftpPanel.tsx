import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { SftpEntry, TransferProgress } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { formatBytes, formatDateTime } from '@renderer/utils/format'
import { isTextLike } from '@renderer/utils/text'

interface Props {
  sessionId: string
  connected: boolean
}

/** 文件管理面板：浏览 / 上传 / 下载 / 重命名 / 删除 */
export function SftpPanel({ sessionId, connected }: Props) {
  const openEditor = useAppStore((s) => s.openEditor)
  const openBottomPanel = useAppStore((s) => s.openBottomPanel)
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<TransferProgress | null>(null)
  /** 正在输入的新文件夹名，非 null 时列表顶部显示输入行 */
  const [newFolder, setNewFolder] = useState<string | null>(null)
  /** 正在重命名的条目路径 */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  /** 多选的文件路径 */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const lastClickedRef = useRef<string | null>(null)

  const load = useCallback(
    async (target: string) => {
      setLoading(true)
      setError('')
      try {
        const list = await window.api.sftp.list(sessionId, target)
        setEntries(list)
        setPath(target)
        setSelected(new Set())
        lastClickedRef.current = null
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [sessionId]
  )

  // 进入面板时定位到用户主目录
  useEffect(() => {
    if (!connected) return
    let cancelled = false
    void (async () => {
      try {
        const home = await window.api.sftp.home(sessionId)
        if (!cancelled) await load(home)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connected, sessionId, load])

  useEffect(() => {
    return window.api.sftp.onProgress((p) => {
      if (p.sessionId !== sessionId) return
      setProgress(p)
      if (p.transferred >= p.total) window.setTimeout(() => setProgress(null), 800)
    })
  }, [sessionId])

  const parentPath = path.replace(/\/[^/]+\/?$/, '') || '/'

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      await load(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleSelected = (target: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
    lastClickedRef.current = target
  }

  /** 普通点击单选，Ctrl / Cmd 点击切换，Shift 点击选一段 */
  const handleRowClick = (event: ReactMouseEvent, entry: SftpEntry): void => {
    const target = event.target as HTMLElement
    if (target.closest('input, [data-row-action]')) return

    const index = entries.findIndex((item) => item.path === entry.path)

    if (event.shiftKey && lastClickedRef.current) {
      const start = entries.findIndex((item) => item.path === lastClickedRef.current)
      if (start >= 0) {
        const from = Math.min(start, index)
        const to = Math.max(start, index)
        setSelected(new Set(entries.slice(from, to + 1).map((item) => item.path)))
        return
      }
    }

    if (event.ctrlKey || event.metaKey) {
      toggleSelected(entry.path)
      return
    }

    setSelected(new Set([entry.path]))
    lastClickedRef.current = entry.path
  }

  const downloadSelected = async (): Promise<void> => {
    const paths = entries.filter((item) => selected.has(item.path)).map((item) => item.path)
    if (paths.length === 0) return

    setBusy(true)
    setError('')
    try {
      const tasks = await window.api.downloads.addMany(sessionId, paths)
      setSelected(new Set())
      if (tasks.length > 0) openBottomPanel('downloads')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async (): Promise<void> => {
    const items = entries.filter((item) => selected.has(item.path))
    if (items.length === 0) return
    if (!window.confirm(`确定删除选中的 ${items.length} 项？目录会递归删除。`)) return

    setBusy(true)
    setError('')
    try {
      for (const item of items) {
        await window.api.sftp.remove(sessionId, item.path, item.isDirectory)
      }
      setSelected(new Set())
      await load(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!connected) {
    return <p className="p-4 text-center text-[12px] text-shell-400">连接就绪后可管理文件</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-shell-700 px-2 py-1.5">
        <ToolbarButton title="上级目录" onClick={() => void load(parentPath)}>
          ↑
        </ToolbarButton>
        <ToolbarButton title="刷新" onClick={() => void load(path)}>
          ⟳
        </ToolbarButton>
        <ToolbarButton title="新建文件夹" onClick={() => setNewFolder('新建文件夹')}>
          ＋
        </ToolbarButton>
        <ToolbarButton title="上传文件" onClick={() => void run(() => window.api.sftp.upload(sessionId, path))}>
          ⇪
        </ToolbarButton>
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void load(path)
          }}
          className="ml-1 h-6 min-w-0 flex-1 rounded border border-shell-600 bg-shell-900 px-2 font-mono text-[11px] text-shell-200 focus:border-accent-600 focus:outline-none"
        />
      </div>

      {error && <p className="border-b border-shell-700 bg-danger/10 px-3 py-1 text-[11px] text-danger">{error}</p>}
      {progress && (
        <p className="border-b border-shell-700 bg-shell-700/50 px-3 py-1 text-[11px] text-shell-200">
          {progress.direction === 'upload' ? '上传' : '下载'} {progress.name} ·{' '}
          {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-shell-700 bg-shell-800 px-3 py-1 text-[11px] text-shell-400">
        <input
          type="checkbox"
          checked={entries.length > 0 && selected.size === entries.length}
          onChange={(event) =>
            setSelected(event.target.checked ? new Set(entries.map((item) => item.path)) : new Set())
          }
          className="shrink-0 accent-accent-500"
        />
        <span>全选</span>

        {selected.size > 0 && (
          <>
            <span className="text-accent-400">已选 {selected.size} 项</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadSelected()}
              className="rounded px-1.5 py-0.5 text-shell-200 transition-colors hover:bg-shell-700 disabled:opacity-40"
            >
              下载
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeSelected()}
              className="rounded px-1.5 py-0.5 text-danger transition-colors hover:bg-shell-700 disabled:opacity-40"
            >
              删除
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded px-1.5 py-0.5 transition-colors hover:bg-shell-700"
            >
              取消
            </button>
          </>
        )}

        <span className="ml-auto">{entries.length} 项</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {newFolder !== null && (
          <div className="flex items-center gap-2 border-b border-shell-700 px-3 py-1.5">
            <span className="text-shell-300">📁</span>
            <input
              autoFocus
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNewFolder(null)
                if (event.key === 'Enter' && newFolder.trim()) {
                  const target = `${path.replace(/\/$/, '')}/${newFolder.trim()}`
                  setNewFolder(null)
                  void run(() => window.api.sftp.mkdir(sessionId, target))
                }
              }}
              className="h-6 flex-1 rounded border border-accent-600 bg-shell-900 px-2 text-[12px] text-shell-200 focus:outline-none"
            />
          </div>
        )}

        {entries.length === 0 && !loading && (
          <p className="p-4 text-center text-[12px] text-shell-400">空目录</p>
        )}

        {entries.map((entry) => (
          <div
            key={entry.path}
            onClick={(event) => handleRowClick(event, entry)}
            className={`group flex items-center gap-2 border-b border-shell-700/50 px-3 py-1.5 text-[12px] ${
              selected.has(entry.path) ? 'bg-accent-600/10' : 'hover:bg-shell-700/50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(entry.path)}
              onChange={() => toggleSelected(entry.path)}
              onClick={(event) => event.stopPropagation()}
              className="shrink-0 accent-accent-500"
            />
            {renaming === entry.path ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setRenaming(null)
                  if (event.key === 'Enter' && renameValue.trim()) {
                    const target = `${path.replace(/\/$/, '')}/${renameValue.trim()}`
                    setRenaming(null)
                    void run(() => window.api.sftp.rename(sessionId, entry.path, target))
                  }
                }}
                className="h-6 flex-1 rounded border border-accent-600 bg-shell-900 px-2 text-shell-200 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => entry.isDirectory && void load(entry.path)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={entry.path}
              >
                <span>{entry.isDirectory ? '📁' : entry.isSymlink ? '🔗' : '📄'}</span>
                <span className="truncate text-shell-200">{entry.name}</span>
              </button>
            )}

            <span className="w-16 shrink-0 text-right text-[11px] text-shell-400">
              {entry.isDirectory ? '—' : formatBytes(entry.size)}
            </span>
            <span className="hidden w-[104px] shrink-0 text-right text-[11px] text-shell-400 group-hover:inline">
              {formatDateTime(entry.modifiedAt)}
            </span>

            <div
              data-row-action
              className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
            >
              {!entry.isDirectory && isTextLike(entry.name) && (
                <IconButton title="编辑" onClick={() => openEditor(sessionId, entry.path)}>
                  ✎
                </IconButton>
              )}
              <IconButton
                title={entry.isDirectory ? '下载目录' : '下载'}
                onClick={() => {
                  void window.api.downloads.add(sessionId, entry.path).then((tasks) => {
                    if (tasks.length > 0) openBottomPanel('downloads')
                  })
                }}
              >
                ⇩
              </IconButton>
              <IconButton
                title="重命名"
                onClick={() => {
                  setRenaming(entry.path)
                  setRenameValue(entry.name)
                }}
              >
                ✎
              </IconButton>
              <IconButton
                title="删除"
                danger
                onClick={() => {
                  if (!window.confirm(`确定删除 ${entry.name}？`)) return
                  void run(() => window.api.sftp.remove(sessionId, entry.path, entry.isDirectory))
                }}
              >
                ✕
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolbarButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="h-6 w-6 shrink-0 rounded text-shell-300 transition-colors hover:bg-shell-600 hover:text-shell-200"
    >
      {children}
    </button>
  )
}

function IconButton({
  title,
  onClick,
  danger,
  children
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-5 w-5 rounded text-[11px] transition-colors hover:bg-shell-600 ${
        danger ? 'text-danger' : 'text-shell-300 hover:text-shell-200'
      }`}
    >
      {children}
    </button>
  )
}
