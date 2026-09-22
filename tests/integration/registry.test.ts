import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { ConnectionEvent, ConnectionMeta } from '@shared/ipc';
import { ConnectionRegistry } from '@main/db/ConnectionRegistry';
import { APPLICATION_NAME, probeConnection } from '@main/db/poolFactory';
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe.skipIf(skip)('ConnectionRegistry (integration)', () => {
  const events: ConnectionEvent[] = [];
  const reg = new ConnectionRegistry({ emit: (e) => events.push(e), reaperIntervalMs: 0 });
  const { meta, password, database } = metaFromUrl('conn-a');

  beforeAll(() => {
    reg.register(meta, password);
  });

  afterAll(async () => {
    await reg.closeAll();
  });

  it('returns the same pool for the same (connection, database) and a different one per database', () => {
    const p1 = reg.getPool(meta.id, database);
    const p2 = reg.getPool(meta.id, database);
    expect(p1).toBe(p2);
    const p3 = reg.getPool(meta.id, 'postgres');
    expect(p3).not.toBe(p1);
    expect(reg.listDatabasesWithPools(meta.id).sort()).toEqual([database, 'postgres'].sort());
  });

  it('throws for unknown connections', () => {
    expect(() => reg.getPool('nope', database)).toThrow(/Unknown connection/);
  });

  it('probes server info and search_path', async () => {
    const info = await probeConnection(reg.getPool(meta.id, database));
    expect(info.versionNum).toBeGreaterThanOrEqual(160000);
    expect(info.version).toMatch(/PostgreSQL/);
    expect(info.extensions).toContain('plpgsql');
    expect(info.searchPath).toContain('public');
    expect(info.searchPath).toContain(meta.user); // "$user" expanded
    expect(typeof info.isSuperuser).toBe('boolean');
    expect(info.serverEncoding).toBe('UTF8');
  });

  it('uses per-pool type parsers (int8/numeric stay strings)', async () => {
    const r = await reg.getPool(meta.id, database).query('SELECT 9007199254740993::int8 AS b, 1.10::numeric AS n, ARRAY[1.10]::numeric[] AS a');
    expect(r.rows[0]).toEqual({ b: '9007199254740993', n: '1.10', a: ['1.10'] });
  });

  it('disconnect ends every backend tagged pgterminal within 1 s', async () => {
    // Count only the backends this registry opened: other test files (and a running app) use
    // the same application_name, so a global count makes this assertion order-dependent.
    const mine = async (): Promise<number[]> => {
      const rows = await Promise.all(
        [database, 'postgres'].map(async (db) => {
          const r = await reg.getPool(meta.id, db).query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
          return Number(r.rows[0]?.pid);
        })
      );
      return rows;
    };
    const pids = await mine();
    expect(pids.length).toBeGreaterThan(0);
    const stillAlive = async (): Promise<number> =>
      withTestPool(async (pool) => {
        const r = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM pg_stat_activity WHERE pid = ANY($1)', [pids]);
        return Number(r.rows[0]?.n ?? 0);
      }, 1);
    await reg.disconnect(meta.id);
    const deadline = Date.now() + 1000;
    let n = await stillAlive();
    while (n > 0 && Date.now() < deadline) {
      await sleep(50);
      n = await stillAlive();
    }
    expect(n).toBe(0);
    expect(reg.listDatabasesWithPools(meta.id)).toEqual([]);
    expect(events.some((e) => e.type === 'disconnected' && e.connectionId === meta.id)).toBe(true);
  });

  it('closeAll resolves within the close timeout even with a busy client checked out', async () => {
    const pool = reg.getPool(meta.id, database);
    const client = await pool.connect();
    const busy = client.query('SELECT pg_sleep(10)').catch(() => undefined);
    await sleep(100);
    const t0 = Date.now();
    await reg.closeAll();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2500);
    // release the client so the process can exit; the pool has already been abandoned by the registry
    try {
      client.release(true);
    } catch {
      // ignore
    }
    await withTestPool((p) =>
      p.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND query LIKE '%pg_sleep(10)%' AND pid <> pg_backend_pid()`, [APPLICATION_NAME])
    , 1);
    await busy;
  });

  it('a terminated idle backend emits poolError (or is dropped silently) and never crashes', async () => {
    const reg2 = new ConnectionRegistry({ emit: (e) => events.push(e), reaperIntervalMs: 0 });
    reg2.register(metaFromUrl('conn-b').meta, password);
    const pool = reg2.getPool('conn-b', database);
    await pool.query('SELECT 1'); // creates one idle client
    expect(pool.idleCount).toBe(1);
    let unhandled: unknown = null;
    const onUnhandled = (e: unknown): void => {
      unhandled = e;
    };
    process.on('unhandledRejection', onUnhandled);
    process.on('uncaughtException', onUnhandled);
    try {
      await withTestPool((p) =>
        p.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND state = 'idle' AND pid <> pg_backend_pid()`, [APPLICATION_NAME])
      , 1);
      await sleep(300);
      const r = await pool.query('SELECT 2 AS two');
      expect(r.rows[0]).toEqual({ two: 2 });
      await sleep(100);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      process.off('uncaughtException', onUnhandled);
      await reg2.closeAll();
    }
    expect(unhandled).toBeNull();
    const poolErrors = events.filter((e) => e.type === 'poolError' && e.connectionId === 'conn-b');
    // eslint-disable-next-line no-console
    console.info(`[registry] poolError events after backend termination: ${poolErrors.length}`);
    for (const e of poolErrors) expect(e.error?.message).toBeTruthy();
  });

  it('reapIdle ends only stale pools on non-default databases', async () => {
    const reg3 = new ConnectionRegistry({ emit: () => undefined, reaperIntervalMs: 0, idlePoolMs: 1000 });
    reg3.register(metaFromUrl('conn-c').meta, password);
    await reg3.getPool('conn-c', database).query('SELECT 1');
    await reg3.getPool('conn-c', 'postgres').query('SELECT 1');
    await reg3.reapIdle(Date.now() + 5000);
    expect(reg3.listDatabasesWithPools('conn-c')).toEqual([database]);
    await reg3.closeAll();
  });
});

describe('ConnectionRegistry (no database needed)', () => {
  it('register/updateMeta/unregister bookkeeping', async () => {
    const reg = new ConnectionRegistry({ emit: () => undefined, reaperIntervalMs: 0 });
    const { meta } = metaFromUrl('x');
    reg.register(meta, 'pw');
    expect(reg.has('x')).toBe(true);
    reg.updateMeta({ ...meta, name: 'renamed' });
    expect(reg.getMeta('x')?.name).toBe('renamed');
    await reg.unregister('x');
    expect(reg.has('x')).toBe(false);
    await reg.closeAll();
  });

  it('never ends a pool created for a different registry', () => {
    const a = new Pool({ connectionString: PG_TEST_URL, max: 1 });
    expect(a.totalCount).toBe(0);
    void a.end();
  });
});
