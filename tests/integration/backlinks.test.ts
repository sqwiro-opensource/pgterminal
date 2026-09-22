import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildCompletionIndex } from '@main/catalog/CompletionIndex';
import { getFkIndex, type FkEntry } from '@main/catalog/fkIndex';
import { findBacklinks, planGroups } from '@main/doclink/BacklinkFinder';
import type { CompletionIndex } from '@shared/types/catalog';
import type { BacklinksEvent, BacklinksRequest, DocTarget } from '@shared/types/doclink';
import { setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();
const CONN = 'test-conn';
const DB = 'pgui_test';

const target: DocTarget = { schema: 'sales', table: 'sales_customer', keyColumn: '_id', keyValue: '1', rank: 1, reason: 'prefixedName' };

function request(over: Partial<BacklinksRequest> = {}): BacklinksRequest {
  return {
    jobId: `job-${Math.random().toString(36).slice(2)}`,
    connectionId: CONN,
    database: DB,
    target,
    row: { id: 1, _id: 'sales_customer/1', name: 'Customer 1' },
    scope: { mode: 'sameSchema' },
    perTableLimit: 50,
    perQueryTimeoutMs: 5000,
    ...over
  };
}

async function run(pool: Pool, index: CompletionIndex, fkIndex: FkEntry[], req: BacklinksRequest, onGroup?: (e: BacklinksEvent, signal: { cancelled: boolean }) => void) {
  const events: BacklinksEvent[] = [];
  const signal = { cancelled: false };
  const client = await pool.connect();
  try {
    await findBacklinks(req, { pool: client, index, fkIndex }, (e) => {
      events.push(e);
      onGroup?.(e, signal);
    }, signal);
  } finally {
    client.release();
  }
  return events;
}

type GroupEvent = Extract<BacklinksEvent, { type: 'group' }>;
const groupsOf = (events: BacklinksEvent[]) => events.filter((e): e is GroupEvent => e.type === 'group');

describe.skipIf(skip)('BacklinkFinder (integration)', () => {
  let index: CompletionIndex;
  let fkIndex: FkEntry[];
  beforeAll(async () => {
    await withTestPool(async (pool) => {
      index = await buildCompletionIndex(pool);
      fkIndex = await getFkIndex(pool);
    });
  });

  it('fkIndex lists the sales_order → sales_customer FK', () => {
    const fk = fkIndex.find((f) => f.table === 'sales_order' && f.refTable === 'sales_customer');
    expect(fk).toMatchObject({ schema: 'sales', columns: ['customer_id'], refSchema: 'sales', refColumns: ['id'] });
  });

  it('finds orders via FK, text customer_ref and nested jsonb payload; plan first, done last', async () => {
    await withTestPool(async (pool) => {
      const events = await run(pool, index, fkIndex, request());
      expect(events[0]?.type).toBe('plan');
      expect(events.at(-1)?.type).toBe('done');
      const plan = events[0] as Extract<BacklinksEvent, { type: 'plan' }>;
      expect(plan.groups[0]).toMatchObject({ via: 'fk', schema: 'sales', table: 'sales_order', column: 'customer_id' });
      const groups = groupsOf(events);
      expect(groups.length).toBe(plan.groups.length);
      const fk = groups.find((g) => g.via === 'fk');
      const text = groups.find((g) => g.via === 'text' && g.column === 'customer_ref');
      const json = groups.find((g) => g.via === 'jsonb' && g.column === 'payload');
      expect(fk?.count).toBe(4); // 200 orders over 50 customers
      expect(fk?.truncated).toBe(false);
      expect(fk?.fields.map((f) => f.name)).toContain('customer_ref');
      expect(text?.count).toBe(4);
      expect(json?.count).toBe(4);
      for (const g of groups) expect(g.error).toBeUndefined();
      // nested refs: the customer's own meta holds auth_user refs, not sales_customer ones → no self hit expected
      const self = groups.find((g) => g.table === 'sales_customer' && g.column === 'meta');
      expect(self?.count).toBe(0);
    });
  });

  it('fkOnly yields only the FK group; explicit tables scope limits the scan', async () => {
    await withTestPool(async (pool) => {
      const fkOnly = await run(pool, index, fkIndex, request({ scope: { mode: 'fkOnly' } }));
      expect(groupsOf(fkOnly).map((g) => g.via)).toEqual(['fk']);
      const tables = await run(pool, index, fkIndex, request({ scope: { mode: 'tables', tables: [{ schema: 'public', table: 'users' }] } }));
      const g = groupsOf(tables);
      expect(g.some((x) => x.via === 'array' && x.table === 'users' && x.column === 'tags' && x.count === 1)).toBe(true);
      expect(g.every((x) => x.via === 'fk' || x.table === 'users')).toBe(true);
    });
  });

  it('whole-database scan of the seed finishes quickly and reports the big table', async () => {
    await withTestPool(async (pool) => {
      const req = request({ scope: { mode: 'wholeDb' }, perQueryTimeoutMs: 8000 });
      const t0 = performance.now();
      const events = await run(pool, index, fkIndex, req);
      const ms = performance.now() - t0;
      const groups = groupsOf(events);
      // eslint-disable-next-line no-console
      console.log(`[backlinks] wholeDb: ${groups.length} groups in ${ms.toFixed(0)} ms`);
      expect(events.at(-1)?.type).toBe('done');
      expect(groups.length).toBe(planGroups(req, { index, fkIndex }).length);
      const bigJson = groups.find((g) => g.table === 'big' && g.column === 'j');
      expect(bigJson?.count).toBeGreaterThan(0); // j.ref = 'sales_customer/1' for i % 50 = 0 → 20000 rows, capped
      expect(bigJson?.truncated).toBe(true);
      expect(bigJson?.rows.length).toBe(50);
      expect(ms).toBeLessThan(10_000);
    });
  }, 60_000);

  it('cancel after the first group stops the job', async () => {
    await withTestPool(async (pool) => {
      const events = await run(pool, index, fkIndex, request({ scope: { mode: 'wholeDb' } }), (e, signal) => {
        if (e.type === 'group') signal.cancelled = true;
      });
      expect(groupsOf(events)).toHaveLength(1);
      expect(events.at(-1)?.type).toBe('cancelled');
    });
  });

  it('a per-query timeout surfaces as a group error (57014) and the run continues', async () => {
    await withTestPool(async (pool) => {
      const events = await run(pool, index, fkIndex, request({ scope: { mode: 'tables', tables: [{ schema: 'public', table: 'big' }] }, perQueryTimeoutMs: 1 }));
      const groups = groupsOf(events);
      const t = groups.find((g) => g.column === 't');
      expect(t?.error?.code).toBe('57014');
      expect(events.at(-1)?.type).toBe('done');
      // the connection is still usable afterwards
      const ok = await pool.query('SELECT 1 AS one');
      expect(ok.rows[0]).toEqual({ one: 1 });
    });
  });
});
