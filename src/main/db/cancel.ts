import type { Pool } from 'pg';
import { runs } from './QueryRunner';

/**
 * Cancels a running query server-side via pg_cancel_backend on a *different* client of the same pool.
 * The runner observes SQLSTATE 57014 (or the `cancelled` flag) and emits `cancelled`.
 */
export async function cancelRun(
  runId: string,
  getPool: (connectionId: string, database: string) => Pool
): Promise<{ sent: boolean }> {
  const state = runs.get(runId);
  if (!state) return { sent: false };
  state.cancelled = true;
  if (!state.pid) return { sent: false };
  try {
    const pool = getPool(state.connectionId, state.database);
    const r = await pool.query<{ ok: boolean }>('SELECT pg_cancel_backend($1) AS ok', [state.pid]);
    return { sent: r.rows[0]?.ok === true };
  } catch {
    return { sent: false };
  }
}
