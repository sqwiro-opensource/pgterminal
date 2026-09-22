import { handle } from './handle';
import { getDdl } from '@main/ddl/DdlService';
import { registry } from '@main/db/ConnectionRegistry';

export function registerDdlIpc(): void {
  handle('ddl:get', async (req) => {
    if (!registry.has(req.connectionId)) throw new Error(`Connection ${req.connectionId} is not connected`);
    const pool = registry.getPool(req.connectionId, req.database);
    return { sql: await getDdl(pool, req) };
  });
}
