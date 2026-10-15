import { BrowserWindow } from 'electron'

/** 把事件推送给所有渲染进程窗口 */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
