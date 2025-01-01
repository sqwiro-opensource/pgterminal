import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { PostgresConfig } from './index.d'

// Custom APIs for renderer
const api = {
  // Add database methods
  testConnection: (config: PostgresConfig) => ipcRenderer.invoke('test-connection', config),
  disconnectServer: (config: PostgresConfig) => ipcRenderer.invoke('disconnect-server', config),
  changeDatabase: (database: string) => ipcRenderer.invoke('change-database', database),
  dbQuery: (query: string, params?: any[]) => ipcRenderer.invoke('db-query', query, params)
}

const extendedElectronAPI = Object.assign(electronAPI, {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window')
})

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', extendedElectronAPI)
    contextBridge.exposeInMainWorld('api', api)

    // // Expose process.env to renderer
    // contextBridge.exposeInMainWorld('process', {
    //   env: process.env
    // })

    // // You might also want to expose other Node.js APIs that you need
    // contextBridge.exposeInMainWorld('versions', {
    //   node: () => process.versions.node,
    //   chrome: () => process.versions.chrome,
    //   electron: () => process.versions.electron
    // })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = extendedElectronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
