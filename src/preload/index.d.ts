import { ElectronAPI } from '@electron-toolkit/preload'

export interface PostgresConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

declare global {
  interface Window {
    process: {
      env: NodeJS.ProcessEnv
    }
    versions: {
      node: () => string
      chrome: () => string
      electron: () => string
    }
    electron: ElectronAPI & {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
    api: {
      testConnection: (config: PostgresConfig) => Promise<{ databases: string[]; message?: string }>
      disconnectServer: (config: PostgresConfig) => Promise<void>
      changeDatabase: (database: string) => Promise<string[]>
      dbQuery: (
        query: string,
        params?: any[]
      ) => Promise<{
        data: any[]
        timeCost: number
        error?: string
        successMessage?: string
      }>
    }
  }
}
