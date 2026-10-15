import type { ITheme } from '@xterm/xterm'

/** 终端配色，跟界面主题保持一致 */
export const terminalTheme: ITheme = {
  background: '#16181d',
  foreground: '#d5dae3',
  cursor: '#3d9be9',
  cursorAccent: '#16181d',
  selectionBackground: '#3a404a',
  black: '#1b1e24',
  red: '#e0574f',
  green: '#4ec26a',
  yellow: '#e0a336',
  blue: '#3d9be9',
  magenta: '#b478e0',
  cyan: '#43c7c7',
  white: '#a9b1bd',
  brightBlack: '#545c68',
  brightRed: '#ff7b72',
  brightGreen: '#7ee787',
  brightYellow: '#ffd866',
  brightBlue: '#5fb0f0',
  brightMagenta: '#d2a8ff',
  brightCyan: '#6ee7e7',
  brightWhite: '#e6e9ef'
}

export const terminalFontFamily =
  "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace"
