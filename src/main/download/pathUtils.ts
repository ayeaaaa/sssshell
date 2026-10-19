import { join } from 'node:path'

/**
 * 在目标目录里找一个不冲突的文件名。
 * 冲突时按 "name (1).ext"、"name (2).ext" 递增。
 */
export function uniquePath(
  dir: string,
  fileName: string,
  exists: (path: string) => boolean = () => false
): string {
  const direct = join(dir, fileName)
  if (!exists(direct)) return direct

  // 开头的点（.bashrc）不算扩展名
  const dot = fileName.lastIndexOf('.')
  const hasExtension = dot > 0
  const base = hasExtension ? fileName.slice(0, dot) : fileName
  const extension = hasExtension ? fileName.slice(dot) : ''

  for (let index = 1; index < 1000; index += 1) {
    const candidate = join(dir, `${base} (${index})${extension}`)
    if (!exists(candidate)) return candidate
  }

  throw new Error(`无法为 ${fileName} 找到可用的文件名`)
}
