import { statSync } from 'node:fs'
import { basename, join, posix } from 'node:path'
import type { SFTPWrapper, Stats } from 'ssh2'
import type { SftpEntry, TransferProgress } from '@shared/types'
import type { SessionManager } from '../ssh/SessionManager'

const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFLNK = 0o120000

/**
 * SFTP 文件操作。按会话懒加载 SFTP 子系统。
 */
export class SftpService {
  constructor(private readonly sessions: SessionManager) {}

  private async sftp(sessionId: string): Promise<SFTPWrapper> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('会话不存在或已断开')
    return session.getSftp()
  }

  async home(sessionId: string): Promise<string> {
    const sftp = await this.sftp(sessionId)
    return new Promise((resolve, reject) => {
      sftp.realpath('.', (err, path) => (err ? reject(err) : resolve(path)))
    })
  }

  async list(sessionId: string, path: string): Promise<SftpEntry[]> {
    const sftp = await this.sftp(sessionId)
    const raw = await new Promise<Array<{ filename: string; attrs: Stats }>>((resolve, reject) => {
      sftp.readdir(path, (err, entries) => (err ? reject(err) : resolve(entries)))
    })

    const entries: SftpEntry[] = []
    for (const item of raw) {
      if (item.filename === '.' || item.filename === '..') continue
      const full = posix.join(path, item.filename)
      const isSymlink = (item.attrs.mode & S_IFMT) === S_IFLNK

      entries.push({
        name: item.filename,
        path: full,
        isDirectory: (item.attrs.mode & S_IFMT) === S_IFDIR,
        isSymlink,
        size: item.attrs.size,
        modifiedAt: item.attrs.mtime * 1000,
        mode: item.attrs.mode,
        owner: item.attrs.uid,
        group: item.attrs.gid
      })
    }

    // 目录在前，同类按名称排序
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return entries
  }

  async mkdir(sessionId: string, path: string): Promise<void> {
    const sftp = await this.sftp(sessionId)
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(path, (err) => (err ? reject(err) : resolve()))
    })
  }

  async rename(sessionId: string, from: string, to: string): Promise<void> {
    const sftp = await this.sftp(sessionId)
    await new Promise<void>((resolve, reject) => {
      sftp.rename(from, to, (err) => (err ? reject(err) : resolve()))
    })
  }

  async remove(sessionId: string, path: string, isDirectory: boolean): Promise<void> {
    const sftp = await this.sftp(sessionId)
    if (!isDirectory) {
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(path, (err) => (err ? reject(err) : resolve()))
      })
      return
    }
    await this.removeDirectory(sftp, path)
  }

  private async removeDirectory(sftp: SFTPWrapper, path: string): Promise<void> {
    const children = await new Promise<Array<{ filename: string; attrs: Stats }>>((resolve, reject) => {
      sftp.readdir(path, (err, entries) => (err ? reject(err) : resolve(entries)))
    })

    for (const child of children) {
      if (child.filename === '.' || child.filename === '..') continue
      const full = posix.join(path, child.filename)
      if ((child.attrs.mode & S_IFMT) === S_IFDIR) {
        await this.removeDirectory(sftp, full)
      } else {
        await new Promise<void>((resolve, reject) => {
          sftp.unlink(full, (err) => (err ? reject(err) : resolve()))
        })
      }
    }

    await new Promise<void>((resolve, reject) => {
      sftp.rmdir(path, (err) => (err ? reject(err) : resolve()))
    })
  }

  /** 远程文件 -> 本地文件 */
  async download(
    sessionId: string,
    remotePath: string,
    localDir: string,
    onProgress?: (p: TransferProgress) => void
  ): Promise<string> {
    const sftp = await this.sftp(sessionId)
    const name = basename(remotePath)
    const localPath = join(localDir, name)
    const total = await this.size(sessionId, remotePath)

    await new Promise<void>((resolve, reject) => {
      sftp.fastGet(
        remotePath,
        localPath,
        {
          concurrency: 8,
          step: (transferred) => {
            onProgress?.({ sessionId, direction: 'download', name, transferred, total })
          }
        },
        (err) => (err ? reject(err) : resolve())
      )
    })

    return localPath
  }

  /** 本地文件/目录 -> 远程目录 */
  async upload(
    sessionId: string,
    localPath: string,
    remoteDir: string,
    onProgress?: (p: TransferProgress) => void
  ): Promise<string> {
    const sftp = await this.sftp(sessionId)
    const name = basename(localPath)
    const remotePath = posix.join(remoteDir, name)
    const total = statSync(localPath).size

    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(
        localPath,
        remotePath,
        {
          concurrency: 8,
          step: (transferred) => {
            onProgress?.({ sessionId, direction: 'upload', name, transferred, total })
          }
        },
        (err) => (err ? reject(err) : resolve())
      )
    })

    return remotePath
  }

  private async size(sessionId: string, path: string): Promise<number> {
    const sftp = await this.sftp(sessionId)
    return new Promise((resolve) => {
      sftp.stat(path, (err, stats) => resolve(err ? 0 : stats.size))
    })
  }
}
