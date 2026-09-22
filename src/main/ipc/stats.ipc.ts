import { handle } from './handle';
import { registry } from '@main/db/ConnectionRegistry';
import { cancelBackend, getOverview } from '@main/stats/StatsService';

function poolFor(connectionId: string) {
  const meta = registry.getMeta(connectionId);
  if (!meta || !registry.has(connectionId)) throw new Error(`Connection ${connectionId} is not connected`);
  return registry.getPool(connectionId, meta.defaultDatabase);
}

/** stats:overview and stats:cancelBackend, always against the connection's default database. */
export function registerStatsIpc(): void {
  handle('stats:overview', async (req) => getOverview(poolFor(req.connectionId), req.connectionId));
  handle('stats:cancelBackend', async (req) => {
    const r = await cancelBackend(poolFor(req.connectionId), { pid: req.pid, terminate: req.terminate });
    if (!r.ok && r.reason) throw new Error(r.reason);
    return { ok: r.ok };
  });
}
