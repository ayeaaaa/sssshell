import { useState } from 'react'
import type { Tag } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { pickTagColor, TAG_PALETTE } from './tagColors'

interface Props {
  onClose: () => void
}

/** 标签管理：改名、换色、删除、新建 */
export function TagManagerDialog({ onClose }: Props) {
  const tags = useAppStore((s) => s.tags)
  const saveTag = useAppStore((s) => s.saveTag)
  const deleteTag = useAppStore((s) => s.deleteTag)
  const [newName, setNewName] = useState('')

  const create = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    await saveTag(name, pickTagColor(tags.map((t) => t.color)))
    setNewName('')
  }

  const cycleColor = (tag: Tag): void => {
    const index = TAG_PALETTE.indexOf(tag.color as (typeof TAG_PALETTE)[number])
    const next = TAG_PALETTE[(index + 1) % TAG_PALETTE.length]
    void saveTag(tag.name, next, tag.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[380px] rounded-md border border-shell-600 bg-shell-800 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-shell-700 px-4 py-2.5">
          <h2 className="text-[13px] font-medium text-shell-200">标签管理</h2>
          <button type="button" onClick={onClose} className="text-shell-300 hover:text-shell-200">
            ✕
          </button>
        </div>

        <div className="max-h-[340px] space-y-1.5 overflow-y-auto px-4 py-3">
          {tags.length === 0 && (
            <p className="py-4 text-center text-[12px] leading-relaxed text-shell-400">
              还没有标签
              <br />
              标签用来给服务器分类，比如「生产」「测试」「客户 A」
            </p>
          )}

          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2">
              <button
                type="button"
                title="点击切换颜色"
                onClick={() => cycleColor(tag)}
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/30 transition-transform hover:scale-110"
                style={{ backgroundColor: tag.color }}
              />
              <input
                key={tag.name}
                defaultValue={tag.name}
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name && name !== tag.name) void saveTag(name, tag.color, tag.id)
                  else event.target.value = tag.name
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-[12px] text-shell-200 hover:border-shell-600 focus:border-accent-600 focus:bg-shell-900 focus:outline-none"
              />
              <button
                type="button"
                title="删除标签"
                onClick={() => {
                  if (window.confirm(`删除标签「${tag.name}」？已打上该标签的连接会一起移除它。`)) {
                    void deleteTag(tag.id)
                  }
                }}
                className="h-5 w-5 shrink-0 rounded text-shell-400 transition-colors hover:bg-shell-600 hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-shell-700 px-4 py-3">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
            }}
            placeholder="新标签名"
            className="h-7 min-w-0 flex-1 rounded border border-shell-600 bg-shell-900 px-2 text-[12px] text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={!newName.trim()}
            className="h-7 rounded bg-accent-600 px-3 text-[12px] text-white transition-colors hover:bg-accent-500 disabled:opacity-40"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  )
}
