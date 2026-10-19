import { posix } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { RemoteFileContent, RemoteSaveRequest, RemoteSaveResult } from '@shared/types'
import type { SessionManager } from '../ssh/SessionManager'
import {
  remoteChmod,
  remoteReadFile,
  remoteRename,
  remoteStat,
  remoteUnlink,
  remoteWriteFile
} from '../sftp/remoteFs'
import { isBinaryBuffer } from './binary'

/** 在线编辑允许的最大文件大小 */
const MAX_EDIT_SIZE = 2 * 1024 * 1024

/**
 * 远程文本文件的读取与保存。
 * 保存走「写临时文件 → 原子替换」，并带 mtime 冲突检测。
 */
export class EditorService {
  constructor(private readonly sessions: SessionManager) {}

  async read(sessionId: string, path: string): Promise<RemoteFileContent> {
    const sftp = await this.sftp(sessionId)
    const stats = await remoteStat(sftp, path)

    if (stats.isDirectory()) throw new Error('这是一个目录，不能编辑')
    if (stats.size > MAX_EDIT_SIZE) {
      throw new Error(`文件超过 2 MB（${(stats.size / 1024 / 1024).toFixed(1)} MB），请先下载到本地编辑`)
    }

    const buffer = await remoteReadFile(sftp, path)
    if (isBinaryBuffer(buffer)) throw new Error('这是二进制文件，不能用文本编辑器打开')

    return {
      path,
      content: buffer.toString('utf8'),
      size: stats.size,
      mtime: stats.mtime,
      mode: stats.mode
    }
  }

  async save(request: RemoteSaveRequest): Promise<RemoteSaveResult> {
    try {
      const sftp = await this.sftp(request.sessionId)
      const stats = await remoteStat(sftp, request.path)

      if (!request.force && Math.round(stats.mtime) !== Math.round(request.expectedMtime)) {
        return { ok: false, reason: 'conflict', mtime: stats.mtime }
      }

      const dir = posix.dirname(request.path)
      const base = posix.basename(request.path)
      const temp = posix.join(dir, `.${base}.tmp-${Date.now()}`)

      await remoteWriteFile(sftp, temp, request.content)

      const mode = stats.mode & 0o7777
      if (mode > 0) {
        try {
          await remoteChmod(sftp, temp, mode)
        } catch {
          // 有些服务器 / 用户没有 chmod 权限，不影响内容保存
        }
      }

      try {
        await this.renameOverwrite(sftp, temp, request.path)
      } catch (error) {
        await remoteUnlink(sftp, temp).catch(() => undefined)
        throw error
      }

      const after = await remoteStat(sftp, request.path)
      return { ok: true, mtime: after.mtime }
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /** 优先用 OpenSSH 的 posix-rename 扩展原子覆盖，不支持时用「备份 → 替换 → 删备份」 */
  private async renameOverwrite(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
    const extended = sftp as SFTPWrapper & {
      ext_openssh_rename?: (oldPath: string, newPath: string, callback: (err?: Error | null) => void) => void
    }

    if (typeof extended.ext_openssh_rename === 'function') {
      try {
        await new Promise<void>((resolve, reject) => {
          extended.ext_openssh_rename?.(from, to, (err) => (err ? reject(err) : resolve()))
        })
        return
      } catch {
        // 服务端不支持扩展时继续走下面的兜底方案
      }
    }

    // 普通 SFTP rename 通常不允许覆盖已存在的文件
    const backup = `${to}.bak-${Date.now()}`
    let backedUp = false

    try {
      await remoteRename(sftp, to, backup)
      backedUp = true
    } catch {
      // 目标文件不存在，直接 rename 即可
    }

    try {
      await remoteRename(sftp, from, to)
    } catch (error) {
      if (backedUp) await remoteRename(sftp, backup, to).catch(() => undefined)
      throw error
    }

    if (backedUp) await remoteUnlink(sftp, backup).catch(() => undefined)
  }

  private async sftp(sessionId: string): Promise<SFTPWrapper> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('会话不存在或已断开')
    return session.getSftp()
  }
}
