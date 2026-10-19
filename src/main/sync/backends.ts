import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { Client as FtpClient } from 'basic-ftp'
import { Client as SshClient } from 'ssh2'
import type { SFTPWrapper } from 'ssh2'
import type { SyncBackendConfig } from '@shared/types'

const FILE_NAME = 'ssh-terminal-backup.enc'

export interface SyncBackend {
  upload(content: string): Promise<void>
  download(): Promise<string>
}

class LocalBackend implements SyncBackend {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return join(this.dir, FILE_NAME)
  }

  async upload(content: string): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.file, content, 'utf8')
  }

  async download(): Promise<string> {
    return readFileSync(this.file, 'utf8')
  }
}

class WebdavBackend implements SyncBackend {
  private readonly url: string
  private readonly auth: string

  constructor(config: SyncBackendConfig) {
    const base = (config.host ?? '').replace(/\/+$/, '')
    const dir = (config.remoteDir ?? '').replace(/^\/+|\/+$/g, '')
    this.url = `${base}/${dir ? `${dir}/` : ''}${FILE_NAME}`
    this.auth = `Basic ${Buffer.from(`${config.username ?? ''}:${config.password ?? ''}`).toString('base64')}`
  }

  async upload(content: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'PUT',
      headers: {
        Authorization: this.auth,
        'Content-Type': 'application/octet-stream'
      },
      body: content
    })

    if (!response.ok) throw new Error(`WebDAV 上传失败：HTTP ${response.status}`)
  }

  async download(): Promise<string> {
    const response = await fetch(this.url, { headers: { Authorization: this.auth } })

    if (response.status === 404) throw new Error('远端还没有备份文件，请先上传一次')
    if (!response.ok) throw new Error(`WebDAV 下载失败：HTTP ${response.status}`)
    return response.text()
  }
}

class FtpBackend implements SyncBackend {
  constructor(private readonly config: SyncBackendConfig) {}

  private async withClient<T>(action: (client: FtpClient) => Promise<T>): Promise<T> {
    const client = new FtpClient(15000)
    try {
      await client.access({
        host: this.config.host ?? '',
        port: this.config.port || 21,
        user: this.config.username ?? '',
        password: this.config.password ?? '',
        secure: this.config.secure === true
      })

      if (this.config.remoteDir) await client.ensureDir(this.config.remoteDir)
      return await action(client)
    } finally {
      client.close()
    }
  }

  upload(content: string): Promise<void> {
    return this.withClient(async (client) => {
      await client.uploadFrom(Readable.from([Buffer.from(content, 'utf8')]), FILE_NAME)
    })
  }

  download(): Promise<string> {
    return this.withClient(async (client) => {
      const chunks: Buffer[] = []
      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(Buffer.from(chunk))
          callback()
        }
      })

      await client.downloadTo(sink, FILE_NAME)
      return Buffer.concat(chunks).toString('utf8')
    })
  }
}

class SftpBackend implements SyncBackend {
  constructor(private readonly config: SyncBackendConfig) {}

  private async connect(): Promise<{ client: SshClient; sftp: SFTPWrapper }> {
    const client = new SshClient()

    await new Promise<void>((resolve, reject) => {
      client
        .on('ready', () => resolve())
        .on('error', reject)
        .connect({
          host: this.config.host ?? '',
          port: this.config.port || 22,
          username: this.config.username ?? '',
          password: this.config.password ?? ''
        })
    })

    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, wrapper) => (err ? reject(err) : resolve(wrapper)))
    })

    return { client, sftp }
  }

  private get remotePath(): string {
    const dir = (this.config.remoteDir ?? '').trim()
    return dir ? posix.join(dir, FILE_NAME) : FILE_NAME
  }

  async upload(content: string): Promise<void> {
    const { client, sftp } = await this.connect()
    try {
      await this.ensureDir(sftp)
      await new Promise<void>((resolve, reject) => {
        sftp.writeFile(this.remotePath, content, (err) => (err ? reject(err) : resolve()))
      })
    } finally {
      client.end()
    }
  }

  async download(): Promise<string> {
    const { client, sftp } = await this.connect()
    try {
      return await new Promise<string>((resolve, reject) => {
        sftp.readFile(this.remotePath, (err, data) =>
          err ? reject(err) : resolve(data.toString('utf8'))
        )
      })
    } finally {
      client.end()
    }
  }

  /** 逐级创建远程目录，已存在就忽略 */
  private async ensureDir(sftp: SFTPWrapper): Promise<void> {
    const dir = (this.config.remoteDir ?? '').trim()
    if (!dir) return

    let current = dir.startsWith('/') ? '' : '.'
    for (const part of dir.split('/').filter(Boolean)) {
      current = current === '.' ? part : posix.join(current, part)
      await new Promise<void>((resolve) => sftp.mkdir(current, () => resolve()))
    }
  }
}

export function createBackend(config: SyncBackendConfig): SyncBackend {
  switch (config.type) {
    case 'local':
      if (!config.localDir) throw new Error('请先选择本地文件夹')
      return new LocalBackend(config.localDir)
    case 'webdav':
      if (!config.host) throw new Error('请填写 WebDAV 地址')
      return new WebdavBackend(config)
    case 'ftp':
      if (!config.host) throw new Error('请填写 FTP 主机')
      return new FtpBackend(config)
    case 'sftp':
      if (!config.host) throw new Error('请填写 SFTP 主机')
      return new SftpBackend(config)
    default:
      throw new Error('不支持的同步方式')
  }
}
