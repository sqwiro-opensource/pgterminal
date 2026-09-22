/**
 * Runs a SQL script through the main query runner on a throw-away run (no session) and resolves
 * when it finishes. Used by confirm dialogs and structure actions; query tabs stream instead.
 */
import type { PgErrorInfo, QueryEvent } from '@shared/types/query';
import { getPgui } from './ipc';

export interface ExecResult {
  ok: boolean;
  error?: PgErrorInfo;
  /** Command tags in order, e.g. ['DROP', 'ALTER']. */
  commands: string[];
  rowCount: number;
  durationMs: number;
  events: QueryEvent[];
}

/** Execute `sql` on `connectionId`/`database`; never throws for SQL errors (see `ok`). */
export function execSql(p: { connectionId: string; database: string; sql: string; continueOnError?: boolean }): Promise<ExecResult> {
  const api = getPgui();
  const runId = crypto.randomUUID();
  return new Promise<ExecResult>((resolve, reject) => {
    const events: QueryEvent[] = [];
    let error: PgErrorInfo | undefined;
    const commands: string[] = [];
    let rowCount = 0;
    const off = api.on('query:event', (e) => {
      if (e.runId !== runId) return;
      events.push(e);
      if (e.type === 'statementDone') {
        commands.push(e.command);
        rowCount += e.rowCount ?? 0;
      } else if (e.type === 'error') error = error ?? e.error;
      else if (e.type === 'done' || e.type === 'cancelled') {
        off();
        resolve({ ok: !error && e.type === 'done', error, commands, rowCount, durationMs: e.type === 'done' ? e.durationMs : 0, events });
      }
    });
    api['query:run']({ runId, connectionId: p.connectionId, database: p.database, sql: p.sql, mode: 'script', continueOnError: p.continueOnError ?? false }).catch((err: Error) => {
      off();
      reject(err);
    });
  });
}

/** Message + hint for toasts. */
export function describeError(e: PgErrorInfo | undefined, fallback = 'Statement failed'): string {
  if (!e) return fallback;
  return e.hint ? `${e.message} — ${e.hint}` : e.message;
}
