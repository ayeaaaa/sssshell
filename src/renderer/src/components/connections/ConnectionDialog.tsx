import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

interface Props {
  /** 为空表示新建 */
  editing: ConnectionConfig | null
  onClose: () => void
}

type FormState = {
  name: string
  group: string
  host: string
  port: string
  username: string
  authMethod: 'password' | 'privateKey'
  password: string
  privateKeyPath: string
  privateKeyPassphrase: string
  keepaliveInterval: string
}

function toForm(config: ConnectionConfig | null): FormState {
  return {
    name: config?.name ?? '',
    group: config?.group ?? '默认分组',
    host: config?.host ?? '',
    port: String(config?.port ?? 22),
    username: config?.username ?? 'root',
    authMethod: config?.authMethod ?? 'password',
    password: config?.password ?? '',
    privateKeyPath: config?.privateKeyPath ?? '',
    privateKeyPassphrase: config?.privateKeyPassphrase ?? '',
    keepaliveInterval: String(config?.keepaliveInterval ?? 30)
  }
}

export function ConnectionDialog({ editing, onClose }: Props) {
  const saveConnection = useAppStore((s) => s.saveConnection)
  const openConnection = useAppStore((s) => s.openConnection)
  const [form, setForm] = useState<FormState>(() => toForm(editing))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const patch = (partial: Partial<FormState>): void => setForm((prev) => ({ ...prev, ...partial }))

  const port = Number.parseInt(form.port, 10)
  const keepalive = Number.parseInt(form.keepaliveInterval, 10)
  const valid = useMemo(
    () => form.host.trim().length > 0 && form.username.trim().length > 0 && Number.isFinite(port),
    [form.host, form.username, port]
  )

  const submit = async (alsoConnect: boolean): Promise<void> => {
    if (!valid) {
      setError('主机地址、用户名、端口都要填对')
      return
    }

    setSaving(true)
    try {
      const saved = await saveConnection({
        id: editing?.id,
        name: form.name.trim(),
        group: form.group.trim() || '默认分组',
        host: form.host.trim(),
        port,
        username: form.username.trim(),
        authMethod: form.authMethod,
        password: form.authMethod === 'password' ? form.password : undefined,
        privateKeyPath: form.authMethod === 'privateKey' ? form.privateKeyPath.trim() : undefined,
        privateKeyPassphrase:
          form.authMethod === 'privateKey' ? form.privateKeyPassphrase || undefined : undefined,
        keepaliveInterval: Number.isFinite(keepalive) ? keepalive : 30
      })

      if (alsoConnect) await openConnection(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[420px] rounded-md border border-shell-600 bg-shell-800 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-shell-700 px-4 py-2.5">
          <h2 className="text-[13px] font-medium text-shell-200">{editing ? '编辑连接' : '新建连接'}</h2>
          <button type="button" onClick={onClose} className="text-shell-300 hover:text-shell-200">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-4">
          <Field label="名称">
            <input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="留空则显示 user@host"
              className={inputClass}
            />
          </Field>
          <Field label="分组">
            <input
              value={form.group}
              onChange={(e) => patch({ group: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="主机地址">
            <input
              value={form.host}
              onChange={(e) => patch({ host: e.target.value })}
              placeholder="192.168.1.10 或 example.com"
              className={inputClass}
            />
          </Field>
          <Field label="端口">
            <input
              value={form.port}
              onChange={(e) => patch({ port: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="用户名">
            <input
              value={form.username}
              onChange={(e) => patch({ username: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="心跳间隔（秒）">
            <input
              value={form.keepaliveInterval}
              onChange={(e) => patch({ keepaliveInterval: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="认证方式" span>
            <div className="flex gap-4 pt-0.5">
              <Radio
                checked={form.authMethod === 'password'}
                onChange={() => patch({ authMethod: 'password' })}
                label="密码"
              />
              <Radio
                checked={form.authMethod === 'privateKey'}
                onChange={() => patch({ authMethod: 'privateKey' })}
                label="私钥"
              />
            </div>
          </Field>

          {form.authMethod === 'password' ? (
            <Field label="密码" span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => patch({ password: e.target.value })}
                className={inputClass}
              />
            </Field>
          ) : (
            <>
              <Field label="私钥文件路径" span>
                <input
                  value={form.privateKeyPath}
                  onChange={(e) => patch({ privateKeyPath: e.target.value })}
                  placeholder="C:\Users\me\.ssh\id_rsa"
                  className={inputClass}
                />
              </Field>
              <Field label="私钥口令" span>
                <input
                  type="password"
                  value={form.privateKeyPassphrase}
                  onChange={(e) => patch({ privateKeyPassphrase: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </>
          )}
        </div>

        {error && <p className="px-4 pb-2 text-[12px] text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-shell-700 px-4 py-3">
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={saving}
            className="rounded bg-accent-600 px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
          >
            保存并连接
          </button>
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={saving}
            className="rounded border border-shell-500 px-3 py-1.5 text-[12px] text-shell-200 transition-colors hover:bg-shell-700 disabled:opacity-50"
          >
            仅保存
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

function Field({
  label,
  span,
  children
}: {
  label: string
  span?: boolean
  children: ReactNode
}) {
  return (
    <label className={span ? 'col-span-2 block' : 'block'}>
      <span className="mb-1 block text-[11px] text-shell-300">{label}</span>
      {children}
    </label>
  )
}

function Radio({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-shell-200">
      <input type="radio" checked={checked} onChange={onChange} className="accent-accent-500" />
      {label}
    </label>
  )
}
