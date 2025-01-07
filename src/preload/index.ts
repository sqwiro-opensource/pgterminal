import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { ArangoDbServerConfig, PostgresConfig } from './index.d';

// Custom APIs for renderer
const api = {
  // Add database methods
  testConnection: (config: PostgresConfig) => ipcRenderer.invoke('test-connection', config),
  disconnectServer: (config: PostgresConfig) => ipcRenderer.invoke('disconnect-server', config),
  changeDatabase: (database: string) => ipcRenderer.invoke('change-database', database),
  dbQuery: (query: string, params?: any[]) => ipcRenderer.invoke('db-query', query, params)
};

const extendedElectronAPI = Object.assign(electronAPI, {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),

  on: (channel: string, callback: Function) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  }
});

const arangoapi = {
  connectArangoDbServer: (config: ArangoDbServerConfig) =>
    ipcRenderer.invoke('connect-arangodb-server', config),
  arangodbQuery: (query: string) => ipcRenderer.invoke('arangodb-query', query),
  selectArangoDbDatabase: (database: string) =>
    ipcRenderer.invoke('select-arangodb-database', database),
  checkArangoDbMigrations: (params: {
    databaseName: string;
    collections: string[];
    MigrationKey: string;
  }) => ipcRenderer.invoke('check-arangodb-migrations', params),
  migrateArangoDbCollections: (params: {
    arangoDatabase: {
      connectionDetails: ArangoDbServerConfig;
      databaseName: string;
      collections: string[];
    };
    postgresDatabase: {
      databaseName: string;
      collections: string[];
    };
    documentMapping: {
      [key: string]: string;
    };
    MigrationKey: string;
  }) => ipcRenderer.invoke('migrate-arangodb-collections', params)
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', extendedElectronAPI);
    contextBridge.exposeInMainWorld('api', api);

    contextBridge.exposeInMainWorld('arangoapi', arangoapi);

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
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = extendedElectronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
