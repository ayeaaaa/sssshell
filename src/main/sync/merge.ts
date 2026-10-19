/**
 * 按 id 合并两份列表：远端同 id 覆盖本地，本地独有的保留，远端独有的追加。
 * 返回新数组，不修改入参。
 */
export function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map(local.map((item) => [item.id, item]))
  for (const item of remote) merged.set(item.id, item)
  return [...merged.values()]
}
