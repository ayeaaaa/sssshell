import { useState } from 'react'
import type { QuickCommand } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

interface Props {
  /** 为空表示新建 */
  editing: QuickCommand | null
  onClose: () => void
}

/** 新建 / 编辑快捷命令 */
export function CommandDialog({ editing, onClose }: Props) {
  const saveCommand = useAppStore((s) => s.saveCommand)
  const [name, setName] = useState(editing?.name ?? '')
  const [command, setCommand] = useState(editing?.command ?? '')
  const [autoRun, setAutoRun] = useState(editing?.autoRun ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim() || !command.trim()) {
      setError('名称和命令内容都要填')
      return
    }

    setSaving(true)
    try {
      await saveCommand({
        id: editing?.id,
        name: name.trim(),
        command,
        autoRun
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[440px] rounded-md border border-shell-600 bg-shell-800 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-shell-700 px-4 py-2.5">
          <h2 className="text-[13px] font-medium text-shell-200">
            {editing ? '编辑快捷命令' : '新建快捷命令'}
          </h2>
          <button type="button" onClick={onClose} className="text-shell-300 hover:text-shell-200">
            ✕
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] text-shell-300">名称</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：查看 Nginx 日志"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-shell-300">命令</span>
            <textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="tail -n 100 /var/log/nginx/error.log"
              className="w-full resize-y rounded border border-shell-600 bg-shell-900 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(event) => setAutoRun(event.target.checked)}
              className="mt-0.5 accent-accent-500"
            />
            <span className="text-[12px] leading-relaxed text-shell-200">
              点击后自动回车执行
              <span className="block text-[11px] text-shell-400">
                取消勾选则只把命令粘贴到终端，留给你确认后再按回车
              </span>
            </span>
          </label>
        </div>

        {error && <p className="px-4 pb-2 text-[12px] text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-shell-700 px-4 py-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded bg-accent-600 px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[12px] text-shell-300 transition-colors hover:bg-shell-700"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'h-7 w-full rounded border border-shell-600 bg-shell-900 px-2 text-[12px] text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none'
