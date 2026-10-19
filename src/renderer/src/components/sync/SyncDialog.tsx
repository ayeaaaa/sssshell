import { useEffect, useState } from 'react'
import type { SyncBackendConfig, SyncBackendType, SyncSettings } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

interface Props {
  onClose: () => void
}

const BACKENDS: Array<[SyncBackendType, string]> = [
  ['local', '本地文件夹'],
  ['webdav', 'WebDAV'],
  ['ftp', 'FTP / FTPS'],
  ['sftp', 'SFTP']
]

const emptyBackend = (type: SyncBackendType): SyncBackendConfig => ({
  type,
  localDir: '',
  host: '',
  port: type === 'ftp' ? 21 : type === 'sftp' ? 22 : undefined,
  username: '',
  password: '',
  remoteDir: '',
  secure: false
})

export function SyncDialog({ onClose }: Props) {
  const loadConnections = useAppStore((s) => s.loadConnections)
  const loadTags = useAppStore((s) => s.loadTags)
  const loadCommands = useAppStore((s) => s.loadCommands)

  const [settings, setSettings] = useState<SyncSettings>({
    backend: emptyBackend('local'),
    autoUpload: false
  })
  const [masterPassword, setMasterPassword] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.sync.getSettings().then((saved) => {
      if (saved) setSettings(saved)
    })
  }, [])

  const backend = settings.backend

  const patchBackend = (patch: Partial<SyncBackendConfig>): void => {
    setSettings((prev) => ({ ...prev, backend: { ...prev.backend, ...patch } }))
  }

  const switchBackend = (type: SyncBackendType): void => {
    const previous = settings.backend
    setSettings((prev) => ({
      ...prev,
      backend: {
        ...emptyBackend(type),
        localDir: previous.localDir,
        host: previous.host,
        port: type === 'ftp' ? 21 : type === 'sftp' ? 22 : undefined,
        username: previous.username,
        password: previous.password,
        remoteDir: previous.remoteDir
      }
    }))
  }

  const pickFolder = async (): Promise<void> => {
    const dir = await window.api.sync.pickFolder()
    if (dir) patchBackend({ localDir: dir })
  }

  const run = async (action: 'upload' | 'download'): Promise<void> => {
    if (!masterPassword.trim()) {
      setStatus({ ok: false, message: '请先输入主密码' })
      return
    }

    setBusy(true)
    setStatus(null)
    try {
      await window.api.sync.saveSettings(settings)

      if (action === 'upload') {
        const result = await window.api.sync.upload(masterPassword)
        setStatus({ ok: result.ok, message: result.message })
      } else {
        const result = await window.api.sync.download(masterPassword)
        setStatus({ ok: result.ok, message: result.message })
        if (result.ok) {
          await Promise.all([loadConnections(), loadTags(), loadCommands()])
        }
      }
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const saveOnly = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.sync.saveSettings(settings)
      setStatus({ ok: true, message: '设置已保存' })
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[520px] rounded-md border border-shell-600 bg-shell-800 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-shell-700 px-4 py-2.5">
          <h2 className="text-[13px] font-medium text-shell-200">配置同步</h2>
          <button type="button" onClick={onClose} className="text-shell-300 hover:text-shell-200">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
          <div>
            <span className="mb-1 block text-[11px] text-shell-300">存储方式</span>
            <div className="flex gap-1">
              {BACKENDS.map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => switchBackend(type)}
                  className={`rounded px-2.5 py-1 text-[12px] transition-colors ${
                    backend.type === type
                      ? 'bg-accent-600 text-white'
                      : 'bg-shell-700 text-shell-300 hover:text-shell-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {backend.type === 'local' ? (
            <label className="block">
              <span className="mb-1 block text-[11px] text-shell-300">
                同步文件夹（可以选百度网盘同步空间、OneDrive、坚果云等目录）
              </span>
              <div className="flex gap-2">
                <input
                  value={backend.localDir ?? ''}
                  onChange={(event) => patchBackend({ localDir: event.target.value })}
                  placeholder="D:\\BaiduSyncdisk\\ssh-terminal"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void pickFolder()}
                  className="h-7 shrink-0 rounded border border-shell-500 px-2 text-[11px] text-shell-200 hover:bg-shell-700"
                >
                  浏览…
                </button>
              </div>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] text-shell-300">
                  {backend.type === 'webdav' ? 'WebDAV 地址' : '主机'}
                </span>
                <input
                  value={backend.host ?? ''}
                  onChange={(event) => patchBackend({ host: event.target.value })}
                  placeholder={
                    backend.type === 'webdav' ? 'https://dav.jianguoyun.com/dav/' : '192.168.1.10'
                  }
                  className={inputClass}
                />
              </label>

              {backend.type !== 'webdav' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-shell-300">端口</span>
                    <input
                      value={String(backend.port ?? '')}
                      onChange={(event) => patchBackend({ port: Number(event.target.value) || undefined })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-shell-300">远程目录</span>
                    <input
                      value={backend.remoteDir ?? ''}
                      onChange={(event) => patchBackend({ remoteDir: event.target.value })}
                      placeholder="/backup/ssh-terminal"
                      className={inputClass}
                    />
                  </label>
                </div>
              )}

              {backend.type === 'webdav' && (
                <label className="block">
                  <span className="mb-1 block text-[11px] text-shell-300">远程目录</span>
                  <input
                    value={backend.remoteDir ?? ''}
                    onChange={(event) => patchBackend({ remoteDir: event.target.value })}
                    placeholder="ssh-terminal"
                    className={inputClass}
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-shell-300">用户名</span>
                  <input
                    value={backend.username ?? ''}
                    onChange={(event) => patchBackend({ username: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-shell-300">密码</span>
                  <input
                    type="password"
                    value={backend.password ?? ''}
                    onChange={(event) => patchBackend({ password: event.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>

              {backend.type === 'ftp' && (
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-shell-200">
                  <input
                    type="checkbox"
                    checked={backend.secure === true}
                    onChange={(event) => patchBackend({ secure: event.target.checked })}
                    className="accent-accent-500"
                  />
                  使用 FTPS（TLS）
                </label>
              )}
            </>
          )}

          <div className="rounded border border-shell-600 bg-shell-900/60 p-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-shell-300">主密码（用于加密备份文件）</span>
              <input
                type="password"
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.target.value)}
                placeholder="换机器恢复时要用同一个主密码"
                className={inputClass}
              />
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-shell-400">
              备份文件用 AES-256 加密，主密码不会保存。忘记主密码将无法恢复备份。
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-shell-200">
            <input
              type="checkbox"
              checked={settings.autoUpload}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, autoUpload: event.target.checked }))
              }
              className="accent-accent-500"
            />
            配置变化后自动上传（本次运行输入过主密码才生效）
          </label>

          {status && (
            <p className={`text-[12px] ${status.ok ? 'text-ok' : 'text-danger'}`}>{status.message}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-shell-700 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('upload')}
            className="rounded bg-accent-600 px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-accent-500 disabled:opacity-40"
          >
            上传备份
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('download')}
            className="rounded border border-shell-500 px-3 py-1.5 text-[12px] text-shell-200 transition-colors hover:bg-shell-700 disabled:opacity-40"
          >
            下载恢复
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveOnly()}
            className="rounded px-3 py-1.5 text-[12px] text-shell-300 transition-colors hover:bg-shell-700 disabled:opacity-40"
          >
            仅保存设置
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'h-7 w-full rounded border border-shell-600 bg-shell-900 px-2 text-[12px] text-shell-200 placeholder:text-shell-400 focus:border-accent-600 focus:outline-none'
