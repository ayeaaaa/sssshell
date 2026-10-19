import type { ConnectionConfig } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { ConnectionTree } from '@renderer/components/connections/ConnectionTree'

interface Props {
  onEdit: (config: ConnectionConfig) => void
  onCreate: () => void
  onManageTags: () => void
  onSync: () => void
}

export function ConnectionSidebar({ onEdit, onCreate, onManageTags, onSync }: Props) {
  const loadConnections = useAppStore((s) => s.loadConnections)

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-shell-700 bg-shell-800">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[12px] font-medium text-shell-200">连接管理</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onManageTags}
            title="标签管理"
            className="rounded px-1.5 py-0.5 text-[11px] text-shell-400 transition-colors hover:bg-shell-700 hover:text-shell-200"
          >
            🏷 标签
          </button>
          <button
            type="button"
            onClick={onSync}
            title="配置同步"
            className="rounded px-1.5 py-0.5 text-[11px] text-shell-400 transition-colors hover:bg-shell-700 hover:text-shell-200"
          >
            ☁ 同步
          </button>
        </div>
      </div>

      <ConnectionTree onEdit={onEdit} onCreate={onCreate} />

      <div className="flex shrink-0 gap-2 border-t border-shell-700 px-2 py-2 text-[11px]">
        <button
          type="button"
          onClick={() => void window.api.connections.importAll().then(() => loadConnections())}
          className="flex-1 rounded border border-shell-600 py-1 text-shell-300 transition-colors hover:bg-shell-700 hover:text-shell-200"
        >
          导入
        </button>
        <button
          type="button"
          onClick={() => void window.api.connections.exportAll()}
          className="flex-1 rounded border border-shell-600 py-1 text-shell-300 transition-colors hover:bg-shell-700 hover:text-shell-200"
        >
          导出
        </button>
      </div>
    </aside>
  )
}
