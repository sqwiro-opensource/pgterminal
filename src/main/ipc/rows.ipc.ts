import { handle } from './handle';
import { registry } from '@main/db/ConnectionRegistry';
import { countRows, fetchRows, mutateRows } from '@main/sql/rowsService';

function poolFor(connectionId: string, database: string) {
  if (!registry.has(connectionId)) throw new Error(`Connection ${connectionId} is not connected`);
  return registry.getPool(connectionId, database);
}

/** rows:fetch | rows:count | rows:mutate — server-side paging, counting and transactional edits. */
export function registerRowsIpc(): void {
  handle('rows:fetch', (req) => fetchRows(poolFor(req.connectionId, req.database), req));
  handle('rows:count', (req) => countRows(poolFor(req.connectionId, req.database), req));
  handle('rows:mutate', (req) => mutateRows(poolFor(req.connectionId, req.database), req));
}
