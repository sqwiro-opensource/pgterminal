import { ipcMain } from 'electron';
import {
  arangodbQuery,
  connectArangoDbServer,
  selectArangoDbDatabase,
  checkArangoDbMigrations,
  migrateArangoDbCollections
} from './server';

ipcMain.handle('connect-arangodb-server', async (_, config) => {
  return await connectArangoDbServer(config);
});

ipcMain.handle('arangodb-query', async (_, query) => {
  return await arangodbQuery(query);
});

ipcMain.handle('select-arangodb-database', async (_, database) => {
  return await selectArangoDbDatabase(database);
});

ipcMain.handle('check-arangodb-migrations', async (_, params) => {
  return await checkArangoDbMigrations(params);
});

ipcMain.handle('migrate-arangodb-collections', async (_, params) => {
  return await migrateArangoDbCollections(params);
});
