import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const FORMAT = 'ssh-terminal-backup'
const VERSION = 1
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 12

interface BackupEnvelope {
  format: string
  version: number
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  data: string
}

/**
 * 用主密码加密整份备份。
 * scrypt 派生密钥 + AES-256-GCM，salt / iv 每次随机。
 */
export function encryptBackup(plaintext: string, password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const key = scryptSync(password, salt, KEY_LENGTH)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  const envelope: BackupEnvelope = {
    format: FORMAT,
    version: VERSION,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  }

  return JSON.stringify(envelope)
}

export function decryptBackup(payload: string, password: string): string {
  let envelope: BackupEnvelope

  try {
    envelope = JSON.parse(payload) as BackupEnvelope
  } catch {
    throw new Error('不是有效的备份文件')
  }

  if (
    !envelope ||
    envelope.format !== FORMAT ||
    !envelope.salt ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.data
  ) {
    throw new Error('不是有效的备份文件')
  }

  const key = scryptSync(password, Buffer.from(envelope.salt, 'base64'), KEY_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final()
    ]).toString('utf8')
  } catch {
    throw new Error('主密码错误，或备份文件已损坏')
  }
}
