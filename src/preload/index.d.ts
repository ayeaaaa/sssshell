import type { SshTerminalApi } from '@shared/api'

declare global {
  interface Window {
    api: SshTerminalApi
  }
}

export {}
