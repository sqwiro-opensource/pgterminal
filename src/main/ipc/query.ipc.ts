import { handle, push } from './handle';
import { registry } from '@main/db/ConnectionRegistry';
import { runQuery, type RunnerDeps } from '@main/db/QueryRunner';
import { cancelRun } from '@main/db/cancel';
import { sessions } from '@main/db/SessionManager';
import { getSettings } from '@main/store/stores';
import { QueryHistory, RunRecorder } from '@main/history/QueryHistory';
import { getCatalogService } from './catalog.ipc';

const history = new QueryHistory();

const deps: RunnerDeps = {
  getPool: (c, d) => registry.getPool(c, d),
  getMeta: (c) => registry.getMeta(c),
  sessions,
  invalidateCatalog: async (c, d) => (await getCatalogService()).invalidate(c, d),
  settings: () => {
    const s = getSettings();
    return { queryRowCap: s.queryRowCap, resultBytesCapMb: s.resultBytesCapMb };
  }
};

export function registerQueryIpc(): void {
  handle('query:run', (req) => {
    if (!registry.has(req.connectionId)) throw new Error('Not connected');
    const recorder = new RunRecorder({ connectionId: req.connectionId, database: req.database, sql: req.sql }, history);
    void runQuery(
      req,
      (e) => {
        push('query:event', e);
        try {
          recorder.observe(e);
        } catch {
          // history is best-effort
        }
      },
      deps
    ).catch((err: unknown) => {
      // Failures outside the per-statement path (e.g. client checkout) surface as an error + done.
      const message = err instanceof Error ? err.message : String(err);
      push('query:event', { runId: req.runId, type: 'error', statementIndex: 0, error: { message } });
      push('query:event', { runId: req.runId, type: 'done', durationMs: 0 });
    });
    return { accepted: true } as const;
  });

  handle('query:cancel', (req) => cancelRun(req.runId, (c, d) => registry.getPool(c, d)));
}
