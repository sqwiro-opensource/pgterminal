import { handle } from './handle';
import { registry } from '@main/db/ConnectionRegistry';
import { sessions } from '@main/db/SessionManager';

export function registerSessionIpc(): void {
  handle('session:open', async (req) => {
    if (!registry.has(req.connectionId)) throw new Error('Not connected');
    return sessions.open(req.sessionId, req.connectionId, req.database);
  });
  handle('session:close', async (req) => {
    await sessions.close(req.sessionId);
  });
}
