import { describe, expect, it } from 'vitest'
import { isBinaryBuffer } from './binary'

describe('isBinaryBuffer', () => {
  it('空文件当成文本', () => {
    expect(isBinaryBuffer(Buffer.alloc(0))).toBe(false)
  })

  it('普通 UTF-8 文本不是二进制', () => {
    expect(isBinaryBuffer(Buffer.from('你好，world\n\tindent\r\n', 'utf8'))).toBe(false)
  })

  it('含 NUL 字节判定为二进制', () => {
    expect(isBinaryBuffer(Buffer.from([0x61, 0x00, 0x62]))).toBe(true)
  })

  it('大量控制字符判定为二进制', () => {
    const buffer = Buffer.alloc(100, 0x01)
    expect(isBinaryBuffer(buffer)).toBe(true)
  })

  it('少量控制字符仍按文本处理', () => {
    const buffer = Buffer.concat([Buffer.from('normal text '), Buffer.from([0x1b]), Buffer.from(' more text')])
    expect(isBinaryBuffer(buffer)).toBe(false)
  })
})
