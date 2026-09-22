import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { cancelBackend, getOverview } from '@main/stats/StatsService';
import { APPLICATION_NAME } from '@main/db/poolFactory';
import { PG_TEST_URL, setupTestDb } from './setup';

const { skip } = await setupTestDb();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe.skipIf(skip)('StatsService (integration)', () => {
  let pool: Pool;
  let other: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: PG_TEST_URL, max: 3, application_name: APPLICATION_NAME });
    other = new Pool({ connectionString: PG_TEST_URL, max: 2, application_name: 'pgterminal-stats-test' });
  });

  afterAll(async () => {
    await Promise.allSettled([pool.end(), other.end()]);
  });

  it('overview lists the test database with a numeric size and the app backend', async () => {
    await pool.query('SELECT 1'); // make sure a pgterminal backend exists
    const o = await getOverview(pool, 'c1');
    expect(o.connectionId).toBe('c1');
    expect(o.server.versionNum).toBeGreaterThanOrEqual(160000);
    expect(o.server.maxConnections).toBeGreaterThan(0);
    expect(o.server.startedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(o.server.extensions).toContain('plpgsql');
    const db = o.databases.find((d) => d.name === 'pgui_test');
    expect(db).toBeDefined();
    expect(db?.sizeBytes).toMatch(/^\d+$/);
    expect(Number(db?.sizeBytes)).toBeGreaterThan(1_000_000);
    expect(db?.cacheHitRatio === null || (db!.cacheHitRatio! >= 0 && db!.cacheHitRatio! <= 1)).toBe(true);
    const own = o.activity.filter((a) => a.app === APPLICATION_NAME);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((a) => a.isOwn)).toBe(true);
    expect(o.errors).toBeUndefined();
    expect(Array.isArray(o.locks)).toBe(true);
    expect(Array.isArray(o.replication)).toBe(true);
    expect(o.timescale).toBeNull();
  });

  it('slow queries come from pg_stat_statements when the extension is installed', async () => {
    const ext = await pool.query<{ installed: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed`);
    await pool.query('SELECT count(*) FROM sales.sales_customer');
    const o = await getOverview(pool, 'c1');
    if (ext.rows[0]?.installed && !o.errors?.slowQueries) {
      expect(o.slowQueries).not.toBeNull();
      expect(o.slowQueries?.source).toBe('pg_stat_statements');
      expect(o.slowQueries!.byTotal.length).toBeGreaterThan(0);
      expect(o.slowQueries!.byMean.length).toBeGreaterThan(0);
      const q = o.slowQueries!.byTotal[0]!;
      expect(q.calls).toMatch(/^\d+$/);
      expect(Number.isFinite(q.totalMs)).toBe(true);
    } else {
      expect(o.slowQueries).toBeNull();
      expect(o.slowQueriesHint).toBeTruthy();
    }
  });

  it('cancelBackend cancels a sleeping session from another app within 1 s', async () => {
    const client = await other.connect();
    const pidRow = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const pid = Number(pidRow.rows[0]!.pid);
    const sleeping = client.query('SELECT pg_sleep(30)').catch((e: unknown) => e as Error);
    await sleep(200);
    const t0 = performance.now();
    const r = await cancelBackend(pool, { pid, terminate: false });
    expect(r.ok).toBe(true);
    const err = await sleeping;
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(1000);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { code?: string }).code).toBe('57014');
    client.release();
  });

  it('refuses to cancel a backend owned by the app', async () => {
    const own = await pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const r = await cancelBackend(pool, { pid: Number(own.rows[0]!.pid), terminate: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/belongs to pgterminal/);
    const still = await pool.query('SELECT 1 AS one');
    expect(still.rows[0]).toEqual({ one: 1 });
  });

  it('returns ok:false for an unknown pid', async () => {
    const r = await cancelBackend(pool, { pid: 2_000_000_000, terminate: false });
    expect(r.ok).toBe(false);
  });

  it('a statement timeout is captured per section, never thrown', async () => {
    const o = await getOverview(pool, 'c1', { statementTimeoutMs: 1 });
    expect(o.connectionId).toBe('c1');
    // With a 1 ms budget at least one catalog-heavy section must time out; the call still returns.
    const errs = o.errors ?? {};
    const failed = Object.keys(errs);
    expect(failed.length).toBeGreaterThan(0);
    for (const k of failed) expect(errs[k as keyof typeof errs]).toMatch(/statement timeout|canceling/i);
    // Sections that failed hold their fallback values.
    if (errs.databases) expect(o.databases).toEqual([]);
    if (errs.activity) expect(o.activity).toEqual([]);
    // The pool is still usable afterwards (no aborted transaction leaked).
    const ok = await pool.query('SELECT 2 AS two');
    expect(ok.rows[0]).toEqual({ two: 2 });
  });
});
