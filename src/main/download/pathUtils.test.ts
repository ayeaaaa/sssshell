import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { uniquePath } from './pathUtils'

const dir = join('C:', 'downloads')

describe('uniquePath', () => {
  it('没有冲突时保持原文件名', () => {
    expect(uniquePath(dir, 'report.txt', () => false)).toBe(join(dir, 'report.txt'))
  })

  it('同名文件已存在时追加 (1)', () => {
    const existing = new Set([join(dir, 'report.txt')])
    expect(uniquePath(dir, 'report.txt', (path) => existing.has(path))).toBe(
      join(dir, 'report (1).txt')
    )
  })

  it('(1) 也被占用时继续递增', () => {
    const existing = new Set([join(dir, 'report.txt'), join(dir, 'report (1).txt')])
    expect(uniquePath(dir, 'report.txt', (path) => existing.has(path))).toBe(
      join(dir, 'report (2).txt')
    )
  })

  it('没有扩展名的文件也能去重', () => {
    const existing = new Set([join(dir, 'README')])
    expect(uniquePath(dir, 'README', (path) => existing.has(path))).toBe(join(dir, 'README (1)'))
  })

  it('点开头的隐藏文件当成无扩展名', () => {
    const existing = new Set([join(dir, '.bashrc')])
    expect(uniquePath(dir, '.bashrc', (path) => existing.has(path))).toBe(join(dir, '.bashrc (1)'))
  })

  it('只保留最后一段扩展名', () => {
    const existing = new Set([join(dir, 'archive.tar.gz')])
    expect(uniquePath(dir, 'archive.tar.gz', (path) => existing.has(path))).toBe(
      join(dir, 'archive.tar (1).gz')
    )
  })
})
