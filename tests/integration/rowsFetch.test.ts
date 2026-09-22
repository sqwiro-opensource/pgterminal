import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { FetchRowsRequest } from '../../src/shared/ipc';
import { countRows, fetchRows } from '../../src/main/sql/rowsService';
import { PG_TEST_URL, setupTestDb } from './setup';

const { skip } = await setupTestDb();

const big = (over: Partial<FetchRowsRequest>): FetchRowsRequest => ({
  connectionId: 'c',
  database: 'pgui_test',
  schema: 'public',
  table: 'big',
  filters: [],
  sort: [],
  limit: 200,
  page: { mode: 'keyset', after: null },
  ...over
});

const customers = (over: Partial<FetchRowsRequest>): FetchRowsRequest => ({
  ...big({}),
  schema: 'sales',
  table: 'sales_customer',
  limit: 100,
  ...over
});

describe.skipIf(skip)('rows:fetch / rows:count (integration)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = new Pool({ connectionString: PG_TEST_URL, max: 2, application_name: 'pgterminal-test' });
  });
  afterAll(async () => {
    await pool.end();
  });

  it('keyset pages 1..3 are contiguous and hasMore; before returns the previous page ascending', async () => {
    const p1 = await fetchRows(pool, big({}));
    expect(p1.pkColumns).toEqual(['id']);
    expect(p1.hasMore).toBe(true);
    expect(p1.rows.length).toBe(200);
    const idIdx = p1.fields.findIndex((f) => f.name === 'id');
    const ids1 = p1.rows.map((r) => Number(r[idIdx]));
    expect(ids1[0]).toBe(1);
    expect(ids1[199]).toBe(200);
    const last1 = Object.fromEntries(p1.fields.map((f, i) => [f.name, p1.rows[199]?.[i] ?? null]));
    const p2 = await fetchRows(pool, big({ page: { mode: 'keyset', after: last1 } }));
    const ids2 = p2.rows.map((r) => Number(r[idIdx]));
    expect(ids2[0]).toBe(201);
    expect(ids2[199]).toBe(400);
    const last2 = Object.fromEntries(p2.fields.map((f, i) => [f.name, p2.rows[199]?.[i] ?? null]));
    const p3 = await fetchRows(pool, big({ page: { mode: 'keyset', after: last2 } }));
    const ids3 = p3.rows.map((r) => Number(r[idIdx]));
    expect(ids3[0]).toBe(401);
    expect(ids3[199]).toBe(600);
    expect(p3.hasMore).toBe(true);
    // back from page 2's first row → page 1, ascending
    const first2 = Object.fromEntries(p2.fields.map((f, i) => [f.name, p2.rows[0]?.[i] ?? null]));
    const back = await fetchRows(pool, big({ page: { mode: 'keyset', after: null, before: first2 } }));
    expect(back.rows.map((r) => Number(r[idIdx]))).toEqual(ids1);
    expect(back.sqlText).toContain('$');
    expect(back.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('field dataTypes are type names and big values arrive as strings', async () => {
    const p = await fetchRows(pool, big({ limit: 1 }));
    const types = Object.fromEntries(p.fields.map((f) => [f.name, f.dataType]));
    expect(types.n).toBe('numeric');
    expect(types.b).toBe('int8');
    expect(types.j).toBe('jsonb');
    const row = p.rows[0]!;
    expect(typeof row[p.fields.findIndex((f) => f.name === 'b')]).toBe('string');
    expect(typeof row[p.fields.findIndex((f) => f.name === 'n')]).toBe('string');
  });

  it('sort by a non-PK column uses offset mode', async () => {
    const p = await fetchRows(pool, big({ sort: [{ column: 't', dir: 'desc' }], limit: 5, page: { mode: 'offset', offset: 0 } }));
    expect(p.sqlText).toContain('ORDER BY t DESC');
    expect(p.sqlText).not.toContain('(id)');
    expect(p.rows.length).toBe(5);
    const p2 = await fetchRows(pool, big({ sort: [{ column: 't', dir: 'desc' }], limit: 5, page: { mode: 'offset', offset: 5 } }));
    expect(p2.sqlText).toContain('OFFSET $');
    expect(p2.rows[0]).not.toEqual(p.rows[0]);
  });

  it('filters: ilike, in, contains (jsonb), eq null', async () => {
    const nameIdx = (p: Awaited<ReturnType<typeof fetchRows>>) => p.fields.findIndex((f) => f.name === 'name');
    const a = await fetchRows(pool, customers({ filters: [{ column: 'name', op: 'ilike', value: "%o'brien%" }] }));
    expect(a.rows.length).toBe(1);
    expect(a.rows[0]?.[nameIdx(a)]).toBe("O'Brien & Sons");

    const b = await fetchRows(pool, customers({ filters: [{ column: 'id', op: 'in', value: [1, 2, 3] }] }));
    expect(b.rows.length).toBe(3);

    const c = await fetchRows(pool, customers({ filters: [{ column: 'meta', op: 'contains', value: { tier: 'gold' } }] }));
    expect(c.rows.length).toBeGreaterThan(0);
    const metaIdx = c.fields.findIndex((f) => f.name === 'meta');
    for (const r of c.rows) expect((r[metaIdx] as { tier: string }).tier).toBe('gold');

    const d = await fetchRows(pool, customers({ filters: [{ column: 'email', op: 'eq', value: null }] }));
    const emailIdx = d.fields.findIndex((f) => f.name === 'email');
    expect(d.rows.length).toBe(5);
    for (const r of d.rows) expect(r[emailIdx]).toBeNull();
    expect(d.sqlText).toContain('email IS NULL');
  });

  it('count: estimate close to 1e6, exact on request', async () => {
    const est = await countRows(pool, { connectionId: 'c', database: 'pgui_test', schema: 'public', table: 'big', filters: [], exact: false });
    expect(est.exact).toBeNull();
    const n = Number(est.estimate);
    expect(n).toBeGreaterThan(800_000);
    expect(n).toBeLessThan(1_200_000);
    const exact = await countRows(pool, { connectionId: 'c', database: 'pgui_test', schema: 'public', table: 'big', filters: [], exact: true });
    expect(exact.exact).toBe('1000000');
    const filtered = await countRows(pool, {
      connectionId: 'c', database: 'pgui_test', schema: 'sales', table: 'sales_customer',
      filters: [{ column: 'email', op: 'eq', value: null }], exact: true
    });
    expect(filtered.exact).toBe('5');
  });

  it('unknown relation fails with a readable error', async () => {
    await expect(fetchRows(pool, big({ table: 'nope' }))).rejects.toThrow(/not found/);
  });
});
