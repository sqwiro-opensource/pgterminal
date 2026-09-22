import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConnectionMeta, QueryEvent, RunQueryRequest } from '@shared/ipc';
import { ConnectionRegistry } from '@main/db/ConnectionRegistry';
import { SessionManager } from '@main/db/SessionManager';
import { runQuery, runs, type RunnerDeps } from '@main/db/QueryRunner';
import { cancelRun } from '@main/db/cancel';
import { PG_TEST_URL, setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();

function metaFromUrl(id: string, overrides: Partial<ConnectionMeta> = {}): { meta: ConnectionMeta; password: string; database: string } {
  const u = new URL(PG_TEST_URL);
  const meta: ConnectionMeta = {
    id,
    name: id,
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    defaultDatabase: u.pathname.replace(/^\//, ''),
    sslMode: 'disable',
    env: 'local',
    readOnly: false,
    poolMax: 4,
    idleTimeoutMs: 30000,
    statementTimeoutMs: 0,
    connectTimeoutMs: 5000,
    hasPassword: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
  return { meta, password: decodeURIComponent(u.password), database: meta.defaultDatabase };
}

/** PROP-17: strict event ordering. */
function assertOrdered(events: QueryEvent[]): void {
  expect(events[0]?.type).toBe('start');
  const last = events[events.length - 1]?.type;
  expect(['done', 'cancelled']).toContain(last);
  const seenFields = new Set<number>();
  for (const e of events) {
    if (e.type === 'fields') seenFields.add(e.statementIndex);
    if (e.type === 'rows') expect(seenFields.has(e.statementIndex)).toBe(true);
  }
  // nothing after done/cancelled
  expect(events.filter((e) => e.type === 'done' || e.type === 'cancelled')).toHaveLength(1);
}

describe.skipIf(skip)('QueryRunner (integration)', () => {
  const registry = new ConnectionRegistry({ emit: () => undefined });
  const sessions = new SessionManager({ getPool: (c, d) => registry.getPool(c, d) });
  const invalidations: string[] = [];
  const CONN = 'qr-conn';
  const RO = 'qr-ro';
  let database = '';

  const deps: RunnerDeps = {
    getPool: (c, d) => registry.getPool(c, d),
    getMeta: (c) => registry.getMeta(c),
    sessions,
    invalidateCatalog: (c, d) => {
      invalidations.push(`${c}/${d}`);
    },
    settings: () => ({ queryRowCap: 10_000, resultBytesCapMb: 64 })
  };

  let runSeq = 0;
  async function run(partial: Partial<RunQueryRequest> & { sql: string }): Promise<QueryEvent[]> {
    const events: QueryEvent[] = [];
    const req: RunQueryRequest = {
      runId: `run-${++runSeq}`,
      connectionId: CONN,
      database,
      mode: 'script',
      ...partial
    };
    await runQuery(req, (e) => events.push(e), deps);
    assertOrdered(events);
    return events;
  }

  beforeAll(() => {
    const a = metaFromUrl(CONN);
    database = a.database;
    registry.register(a.meta, a.password);
    const b = metaFromUrl(RO, { readOnly: true });
    registry.register(b.meta, b.password);
  });

  afterAll(async () => {
    await sessions.closeAll();
    await registry.closeAll();
    await withTestPool((p) => p.query('DROP TABLE IF EXISTS public.qr_t'), 1);
  });

  it('(a) streams 1M rows and stops at the cap of 10,000, truncated, in < 3 s', async () => {
    const t0 = performance.now();
    const events = await run({ sql: 'SELECT * FROM public.big', rowCap: 10_000 });
    const elapsed = performance.now() - t0;
    const rows = events.filter((e) => e.type === 'rows').reduce((n, e) => n + (e.type === 'rows' ? e.rows.length : 0), 0);
    const done = events.find((e) => e.type === 'statementDone');
    expect(rows).toBe(10_000);
    expect(done && done.type === 'statementDone' ? done.truncated : undefined).toBe(true);
    expect(done && done.type === 'statementDone' ? done.rowCount : undefined).toBe(10_000);
    // eslint-disable-next-line no-console
    console.log(`[runner] (a) 10,000 rows of public.big in ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(3000);
  });

  it('(b) cancel via pg_cancel_backend is observed within 500 ms', async () => {
    const events: QueryEvent[] = [];
    const req: RunQueryRequest = { runId: 'run-cancel', connectionId: CONN, database, mode: 'script', sql: 'SELECT pg_sleep(30)' };
    const running = runQuery(req, (e) => events.push(e), deps);
    await new Promise((r) => setTimeout(r, 200));
    expect(runs.has('run-cancel')).toBe(true);
    const t0 = performance.now();
    const { sent } = await cancelRun('run-cancel', (c, d) => registry.getPool(c, d));
    await running;
    const elapsed = performance.now() - t0;
    expect(sent).toBe(true);
    expect(events[events.length - 1]?.type).toBe('cancelled');
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // eslint-disable-next-line no-console
    console.log(`[runner] (b) cancel observed in ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(500);
    expect(runs.has('run-cancel')).toBe(false);
  });

  it('(c) 4-statement script emits 4 statementDone in order and invalidates the catalog', async () => {
    invalidations.length = 0;
    const events = await run({
      sql: 'CREATE TABLE public.qr_t(id int); INSERT INTO public.qr_t VALUES (1),(2); SELECT * FROM public.qr_t; DROP TABLE public.qr_t;'
    });
    const done = events.filter((e) => e.type === 'statementDone');
    expect(done.map((e) => (e.type === 'statementDone' ? e.command : ''))).toEqual(['CREATE', 'INSERT', 'SELECT', 'DROP']);
    expect(done.map((e) => (e.type === 'statementDone' ? e.statementIndex : -1))).toEqual([0, 1, 2, 3]);
    expect(done[1] && done[1].type === 'statementDone' ? done[1].rowCount : -1).toBe(2);
    expect(done[2] && done[2].type === 'statementDone' ? done[2].rowCount : -1).toBe(2);
    const fields = events.filter((e) => e.type === 'fields');
    expect(fields).toHaveLength(1);
    expect(fields[0] && fields[0].type === 'fields' ? fields[0].statementIndex : -1).toBe(2);
    expect(invalidations.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('(d) syntax error carries SQLSTATE 42601 with position/line/col', async () => {
    const events = await run({ sql: 'SELEC 1' });
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' ? err.error.code : undefined).toBe('42601');
    expect(err && err.type === 'error' ? err.error.position : undefined).toBe(1);
    expect(err && err.type === 'error' ? err.error.line : undefined).toBe(1);
    expect(err && err.type === 'error' ? err.error.col : undefined).toBe(1);
    expect(err && err.type === 'error' ? err.error.statementIndex : undefined).toBe(0);
  });

  it('(e) SELECT 1, 1 keeps both unnamed columns', async () => {
    const events = await run({ sql: 'SELECT 1, 1' });
    const fields = events.find((e) => e.type === 'fields');
    expect(fields && fields.type === 'fields' ? fields.fields.map((f) => f.name) : []).toEqual(['?column?', '?column?']);
    const rows = events.find((e) => e.type === 'rows');
    expect(rows && rows.type === 'rows' ? rows.rows : []).toEqual([[1, 1]]);
  });

  it('(f) int8, numeric and int8[] arrive as strings', async () => {
    const events = await run({ sql: `SELECT 9007199254740993::int8, 1.10::numeric, '{1,2}'::int8[]` });
    const rows = events.find((e) => e.type === 'rows');
    expect(rows && rows.type === 'rows' ? rows.rows[0] : []).toEqual(['9007199254740993', '1.10', ['1', '2']]);
    const fields = events.find((e) => e.type === 'fields');
    expect(fields && fields.type === 'fields' ? fields.fields.map((f) => f.dataType) : []).toEqual(['int8', 'numeric', '_int8']);
  });

  it('(g) single mode runs the text as one statement and explain wraps it', async () => {
    const events = await run({ sql: 'SELECT 1', mode: 'single', explain: { analyze: false } });
    const rows = events.find((e) => e.type === 'rows');
    const plan = rows && rows.type === 'rows' ? rows.rows[0]?.[0] : undefined;
    expect(Array.isArray(plan)).toBe(true);
    expect(JSON.stringify(plan)).toContain('Plan');
  });

  it('(h) a session keeps its transaction and temp tables across runs; close rolls back', async () => {
    await sessions.open('sess-1', CONN, database);
    const first = await run({ sql: 'BEGIN; CREATE TEMP TABLE s_t(id int);', sessionId: 'sess-1' });
    expect(first.some((e) => e.type === 'error')).toBe(false);
    expect(sessions.inTransaction('sess-1')).toBe(true);
    const second = await run({ sql: 'INSERT INTO s_t VALUES (1); SELECT count(*)::int FROM s_t', sessionId: 'sess-1' });
    expect(second.some((e) => e.type === 'error')).toBe(false);
    const rows = second.find((e) => e.type === 'rows');
    expect(rows && rows.type === 'rows' ? rows.rows[0] : []).toEqual([1]);
    await sessions.close('sess-1');
    expect(sessions.has('sess-1')).toBe(false);
    await sessions.open('sess-2', CONN, database);
    const third = await run({ sql: 'SELECT count(*) FROM s_t', sessionId: 'sess-2' });
    const err = third.find((e) => e.type === 'error');
    expect(err && err.type === 'error' ? err.error.code : undefined).toBe('42P01');
    await sessions.close('sess-2');
  });

  it('(i) read-only connections reject DML before touching the database', async () => {
    const before = await withTestPool((p) => p.query<{ n: string }>('SELECT count(*)::text AS n FROM a.dup'), 1);
    const events = await run({ connectionId: RO, sql: 'INSERT INTO a.dup VALUES (777)' });
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' ? err.error.code : undefined).toBe('25006');
    expect(err && err.type === 'error' ? err.error.hint : undefined).toBeTruthy();
    const after = await withTestPool((p) => p.query<{ n: string }>('SELECT count(*)::text AS n FROM a.dup'), 1);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    expect(events.some((e) => e.type === 'statementDone')).toBe(false);
  });

  it('(j) continueOnError runs the statements after a failure', async () => {
    const events = await run({ sql: 'SELECT 1; SELECT nope; SELECT 3', continueOnError: true });
    const done = events.filter((e) => e.type === 'statementDone').map((e) => (e.type === 'statementDone' ? e.statementIndex : -1));
    expect(done).toEqual([0, 2]);
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' ? err.error.statementIndex : -1).toBe(1);
    expect(events[events.length - 1]?.type).toBe('done');
  });

  it('stops at the first error without continueOnError, keeping earlier results', async () => {
    const events = await run({ sql: 'SELECT 1; SELECT nope; SELECT 3' });
    const done = events.filter((e) => e.type === 'statementDone').map((e) => (e.type === 'statementDone' ? e.statementIndex : -1));
    expect(done).toEqual([0]);
  });

  it('forwards NOTICE messages as notice events', async () => {
    const events = await run({ sql: `DO $$ BEGIN RAISE NOTICE 'hello from plpgsql'; END $$;` });
    const notice = events.find((e) => e.type === 'notice');
    expect(notice && notice.type === 'notice' ? notice.message : '').toContain('hello from plpgsql');
    expect(notice && notice.type === 'notice' ? notice.severity : '').toBe('NOTICE');
  });

  it('a dead session client is reopened transparently', async () => {
    await sessions.open('sess-dead', CONN, database);
    const pid = sessions.pidOf('sess-dead');
    expect(pid).toBeGreaterThan(0);
    await withTestPool((p) => p.query('SELECT pg_terminate_backend($1)', [pid]), 1);
    await new Promise((r) => setTimeout(r, 300));
    const events = await run({ sql: 'SELECT 42', sessionId: 'sess-dead' });
    // Either the first run already sees a fresh client, or it fails once and the next run reopens.
    if (events.some((e) => e.type === 'error')) {
      const again = await run({ sql: 'SELECT 42', sessionId: 'sess-dead' });
      expect(again.some((e) => e.type === 'error')).toBe(false);
    }
    expect(sessions.pidOf('sess-dead')).not.toBe(pid);
    await sessions.close('sess-dead');
  });

  it('reports error line/col relative to the whole script, not the statement', async () => {
    // statement 3 sits on line 3 of the script; pg reports position 15 within that statement
    const events = await run({ sql: 'SELECT 1;\nSELECT 2;\nSELECT * FROM nope_table;' });
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' ? err.error.code : undefined).toBe('42P01');
    expect(err && err.type === 'error' ? err.error.line : undefined).toBe(3);
    expect(err && err.type === 'error' ? err.error.col : undefined).toBe(15);
  });
});
