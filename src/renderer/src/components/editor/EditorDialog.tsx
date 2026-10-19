import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { useAppStore } from '@renderer/store/useAppStore'
import { formatBytes } from '@renderer/utils/format'

/** 在线编辑远程文本文件 */
export function EditorDialog() {
  const editing = useAppStore((s) => s.editingFile)
  const closeEditor = useAppStore((s) => s.closeEditor)
  if (!editing) return null

  return <EditorBody sessionId={editing.sessionId} path={editing.path} onClose={closeEditor} />
}

function EditorBody({
  sessionId,
  path,
  onClose
}: {
  sessionId: string
  path: string
  onClose: () => void
}) {
  const [initial, setInitial] = useState<string | null>(null)
  const [size, setSize] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const mtimeRef = useRef(0)
  const dirtyRef = useRef(false)
  const saveRef = useRef<() => void>(() => undefined)

  // 读取远程文件
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const file = await window.api.editor.read(sessionId, path)
        if (cancelled) return
        mtimeRef.current = file.mtime
        setSize(file.size)
        setInitial(file.content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, path])

  // 挂载 CodeMirror
  useEffect(() => {
    if (initial === null || !containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          oneDark,
          languageFor(path),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (!dirtyRef.current) {
              dirtyRef.current = true
              setDirty(true)
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': { fontFamily: "'Cascadia Mono', Consolas, monospace" }
          })
        ]
      }),
      parent: containerRef.current
    })

    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [initial, path])

  const save = async (force = false): Promise<void> => {
    const content = viewRef.current?.state.doc.toString()
    if (content === undefined) return

    setSaving(true)
    setSaveError('')
    try {
      const result = await window.api.editor.save({
        sessionId,
        path,
        content,
        expectedMtime: mtimeRef.current,
        force
      })

      if (result.ok) {
        mtimeRef.current = result.mtime
        dirtyRef.current = false
        setDirty(false)
        setSize(content.length)
      } else if (result.reason === 'conflict') {
        if (window.confirm('这个文件在服务器上已经被修改过，仍要用当前内容覆盖吗？')) {
          await save(true)
        }
      } else {
        setSaveError(result.message ?? '保存失败')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // 每次渲染后把最新的保存函数挂到 ref 上，供快捷键使用
  useEffect(() => {
    saveRef.current = () => void save()
  })

  // Ctrl+S 保存，Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        saveRef.current()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        requestClose()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  const requestClose = (): void => {
    if (dirtyRef.current && !window.confirm('有未保存的修改，确定关闭编辑器？')) return
    onClose()
  }

  const fileName = path.split('/').pop() ?? path

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-shell-600 bg-shell-900 shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-shell-700 bg-shell-800 px-3 py-2">
          <span className="text-accent-400">✎</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] text-shell-200">{fileName}</span>
              {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="未保存" />}
            </div>
            <div className="truncate font-mono text-[10px] text-shell-400">{path}</div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {saving && <span className="text-[11px] text-shell-400">保存中…</span>}
            {saveError && (
              <span className="max-w-[320px] truncate text-[11px] text-danger" title={saveError}>
                {saveError}
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading || Boolean(error)}
              className="rounded bg-accent-600 px-3 py-1 text-[12px] text-white transition-colors hover:bg-accent-500 disabled:opacity-40"
            >
              保存
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="rounded px-2 py-1 text-[12px] text-shell-300 transition-colors hover:bg-shell-700 hover:text-shell-200"
            >
              关闭
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {loading && (
            <p className="p-4 text-center text-[12px] text-shell-400">正在读取远程文件…</p>
          )}
          {error && <p className="p-4 text-center text-[12px] text-danger">{error}</p>}
          <div ref={containerRef} className="h-full" />
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-shell-700 px-3 py-1 text-[11px] text-shell-400">
          <span>
            {formatBytes(size)} · UTF-8
            {dirty ? ' · 已修改' : ''}
          </span>
          <span>Ctrl+S 保存 · Esc 关闭</span>
        </footer>
      </div>
    </div>
  )
}

function languageFor(path: string): Extension {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''

  switch (extension) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'json':
      return json()
    case 'py':
      return python()
    case 'md':
    case 'markdown':
      return markdown()
    case 'yml':
    case 'yaml':
      return yaml()
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ksh':
      return StreamLanguage.define(shell)
    case 'ini':
    case 'conf':
    case 'cfg':
    case 'properties':
    case 'env':
      return StreamLanguage.define(properties)
    default:
      return []
  }
}
