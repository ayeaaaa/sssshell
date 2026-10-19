import { describe, expect, it } from 'vitest'
import { decryptBackup, encryptBackup } from './crypto'

describe('backup encryption', () => {
  it('同一主密码可以解密回原文', () => {
    const plain = JSON.stringify({ connections: [{ host: 'example.com' }] })
    const encrypted = encryptBackup(plain, 'correct horse battery staple')
    expect(decryptBackup(encrypted, 'correct horse battery staple')).toBe(plain)
  })

  it('主密码错误时拒绝解密', () => {
    const encrypted = encryptBackup('secret', 'right-password')
    expect(() => decryptBackup(encrypted, 'wrong-password')).toThrow(/主密码错误/)
  })

  it('密文被篡改时拒绝解密', () => {
    const encrypted = encryptBackup('secret', 'pw')
    const parsed = JSON.parse(encrypted) as { data: string }
    parsed.data = Buffer.from('tampered').toString('base64')
    expect(() => decryptBackup(JSON.stringify(parsed), 'pw')).toThrow()
  })

  it('每次加密结果都不同（随机 salt / iv）', () => {
    const first = encryptBackup('same content', 'pw')
    const second = encryptBackup('same content', 'pw')
    expect(first).not.toBe(second)
  })

  it('不是备份文件时给出明确错误', () => {
    expect(() => decryptBackup('{"hello":1}', 'pw')).toThrow(/备份/)
  })
})
