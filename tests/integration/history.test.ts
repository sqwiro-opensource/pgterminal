import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { QueryEvent } from '@shared/ipc';
import { getStores } from '@main/store/stores';
import { QueryHistory, RunRecorder } from '@main/history/QueryHistory';

const NOW = Date.now();

// Pure store logic: no database needed, but it lives with the runner tests it complements.
describe('QueryHistory', () => {
  const stores = getStores({ cwd: mkdtempSync(join(tmpdir(), 'pgui-history-')), projectVersion: '2.0.0' });
  const history = new QueryHistory(stores);

  it('records and lists newest first, filtered by connection and substring', () => {
    history.record({ connectionId: 'a', database: 'db', sql: 'SELECT 1', startedAt: NOW - 4000, durationMs: 5, rowCount: 1, status: 'ok' });
    history.record({ connectionId: 'a', database: 'db', sql: 'SELECT * FROM sales.sales_customer', startedAt: NOW - 3000, durationMs: 7, rowCount: 50, status: 'ok' });
    history.record({ connectionId: 'b', database: 'db', sql: 'DELETE FROM x', startedAt: NOW - 2000, durationMs: 9, rowCount: 0, status: 'error', errorCode: '42P01' });
    history.record({ connectionId: 'b', database: 'db', sql: 'SELECT pg_sleep(30)', startedAt: NOW - 1000, durationMs: 100, rowCount: null, status: 'cancelled' });

    const all = history.list({ limit: 10 });
    expect(all.map((e) => e.sql)).toEqual(['SELECT pg_sleep(30)', 'DELETE FROM x', 'SELECT * FROM sales.sales_customer', 'SELECT 1']);
    expect(history.list({ connectionId: 'a' }).map((e) => e.startedAt)).toEqual([NOW - 3000, NOW - 4000]);
    expect(history.list({ search: 'SALES_customer' }).map((e) => e.sql)).toEqual(['SELECT * FROM sales.sales_customer']);
    const failed = history.list({ search: 'DELETE' })[0];
    expect(failed?.status).toBe('error');
    expect(failed?.errorCode).toBe('42P01');
    expect(all.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
  });

  it('retention from settings hides old entries but keeps them on disk', () => {
    const old = history.record({ connectionId: 'a', database: 'db', sql: 'SELECT old', startedAt: Date.now() - 400 * 86_400_000, durationMs: 1, rowCount: 0, status: 'ok' });
    expect(history.list({ search: 'SELECT old' })).toHaveLength(0);
    expect(stores.history.get('entries').some((e) => e.id === old.id)).toBe(true);
  });

  it('clearing one connection leaves the others', () => {
    history.clear('a');
    expect(history.list({ connectionId: 'a' })).toHaveLength(0);
    expect(history.list({ connectionId: 'b' })).toHaveLength(2);
    history.clear();
    expect(history.list()).toHaveLength(0);
  });

  it('RunRecorder folds events into one entry', () => {
    const rec = new RunRecorder({ connectionId: 'c', database: 'db', sql: 'SELECT 1; UPDATE t SET x = 1' }, history);
    const feed = (e: Record<string, unknown>): unknown => rec.observe({ runId: 'r', ...e } as unknown as QueryEvent);
    expect(feed({ type: 'start', statementCount: 2 })).toBeUndefined();
    expect(feed({ type: 'statementDone', statementIndex: 0, command: 'SELECT', rowCount: 1, truncated: false, durationMs: 1 })).toBeUndefined();
    expect(feed({ type: 'statementDone', statementIndex: 1, command: 'UPDATE', rowCount: 3, truncated: false, durationMs: 1 })).toBeUndefined();
    const entry = feed({ type: 'done', durationMs: 5 }) as { rowCount: number; status: string };
    expect(entry.rowCount).toBe(4);
    expect(entry.status).toBe('ok');

    const rec2 = new RunRecorder({ connectionId: 'c', database: 'db', sql: 'SELEC 1' }, history);
    rec2.observe({ runId: 'r2', type: 'start', statementCount: 1 });
    rec2.observe({ runId: 'r2', type: 'error', statementIndex: 0, error: { message: 'syntax', code: '42601' } });
    const failed = rec2.observe({ runId: 'r2', type: 'done', durationMs: 1 });
    expect(failed?.status).toBe('error');
    expect(failed?.errorCode).toBe('42601');

    const rec3 = new RunRecorder({ connectionId: 'c', database: 'db', sql: '   ' }, history);
    rec3.observe({ runId: 'r3', type: 'start', statementCount: 0 });
    expect(rec3.observe({ runId: 'r3', type: 'done', durationMs: 0 })).toBeUndefined();
  });
});
