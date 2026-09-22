import { contextBridge } from 'electron';
import { createApi } from './api';

if (!process.contextIsolated) {
  throw new Error('pgui requires contextIsolation; refusing to expose the API on the global scope.');
}

contextBridge.exposeInMainWorld('pgui', createApi());
