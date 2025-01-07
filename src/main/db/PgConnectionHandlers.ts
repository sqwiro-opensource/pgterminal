// src/main/index.ts
import { ipcMain } from 'electron';
import { changeDatabase, dbQuery, disconnectServer, testConnection } from './pgserver';

// ... existing window creation code ...

// Set up IPC handlers
ipcMain.handle('test-connection', async (_, config) => {
  return await testConnection(config);
});

ipcMain.handle('change-database', async (_, database: string) => {
  return await changeDatabase(database);
});

ipcMain.handle('db-query', async (_, query: string, params?: any[]) => {
  return await dbQuery(query, params);
});

ipcMain.handle('disconnect-server', async (_, config) => {
  return await disconnectServer(config);
});
