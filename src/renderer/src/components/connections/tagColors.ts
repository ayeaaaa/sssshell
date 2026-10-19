/** 标签可选配色，新建标签时按顺序取第一个没被用过的 */
export const TAG_PALETTE = [
  '#3d9be9',
  '#4ec26a',
  '#e0a336',
  '#e0574f',
  '#b478e0',
  '#43c7c7',
  '#f0789c',
  '#8f9bb3'
] as const

export function pickTagColor(usedColors: string[]): string {
  const free = TAG_PALETTE.find((color) => !usedColors.includes(color))
  return free ?? TAG_PALETTE[usedColors.length % TAG_PALETTE.length]
}
