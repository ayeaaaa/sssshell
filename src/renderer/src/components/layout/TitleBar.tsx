export function TitleBar() {
  return (
    <header className="drag-region flex h-9 shrink-0 items-center justify-between border-b border-shell-700 bg-shell-950 pl-3">
      <div className="flex items-center gap-2 text-[12px] text-shell-300">
        <span className="text-accent-500">◧</span>
        <span className="font-medium text-shell-200">SimpleShell</span>
        <span className="text-shell-400">SSH / SFTP 终端</span>
      </div>

      <div className="no-drag flex h-full items-stretch">
        <button
          type="button"
          title="最小化"
          onClick={() => window.api.window.minimize()}
          className="w-11 text-shell-300 transition-colors hover:bg-shell-700 hover:text-shell-200"
        >
          ─
        </button>
        <button
          type="button"
          title="最大化 / 还原"
          onClick={() => window.api.window.toggleMaximize()}
          className="w-11 text-shell-300 transition-colors hover:bg-shell-700 hover:text-shell-200"
        >
          ▢
        </button>
        <button
          type="button"
          title="关闭"
          onClick={() => window.api.window.close()}
          className="w-11 text-shell-300 transition-colors hover:bg-danger hover:text-white"
        >
          ✕
        </button>
      </div>
    </header>
  )
}
