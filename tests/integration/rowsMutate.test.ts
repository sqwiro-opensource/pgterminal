import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DEFAULT_SENTINEL, type FetchRowsRequest } from '../../src/shared/ipc';
import { fetchRows, mutateRows } from '../../src/main/sql/rowsService';
import { PG_TEST_URL, setupTestDb } from './setup';

const { skip } = await setupTestDb();
const T = 'mut_t';

const req = (ops: Parameters<typeof mutateRows>[1]['ops'], dryRun = false) => ({
  connectionId: 'c', database: 'pgui_test', schema: 'public', table: T, ops, dryRun
});
const fetchAll = (pool: Pool, over: Partial<FetchRowsRequest> = {}) =>
  fetchRows(pool, {
    connectionId: 'c', database: 'pgui_test', schema: 'public', table: T,
    filters: [], sort: [], limit: 100, page: { mode: 'keyset', after: null }, ...over
  });
const asObjects = (p: Awaited<ReturnType<typeof fetchRows>>) =>
  p.rows.map((r) => Object.fromEntries(p.fields.map((f, i) => [f.name, r[i]])));

describe.skipIf(skip)('rows:mutate (integration)', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: PG_TEST_URL, max: 2, application_name: 'pgterminal-test' });
    await pool.query(`DROP TABLE IF EXISTS public.${T}`);
    await pool.query(
      `CREATE TABLE public.${T} (id serial PRIMARY KEY, t text, t2 text, j jsonb, n numeric(30,10), arr int8[], b bool, req text NOT NULL DEFAULT 'x')`
    );
  });
  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS public.${T}`);
    await pool.end();
  });

  it('NULL, empty string, JSON null, exact numeric and int8[] round-trip (PROP-11/12/13)', async () => {
    const r = await mutateRows(pool, req([
      { op: 'insert', values: { id: DEFAULT_SENTINEL, t: null, t2: '', j: null, n: '1.0000000001', arr: ['9007199254740993'], b: true } },
      { op: 'insert', values: { t: 'json-null', j: 'null' } },
      { op: 'insert', values: { t: 'json-str', j: '"null"' } }
    ]));
    expect(r.ok).toBe(true);
    expect(r.results?.length).toBe(3);
    expect(r.results?.[0]?.rowCount).toBe(1);
    const rows = asObjects(await fetchAll(pool));
    const first = rows.find((x) => x.t === null && x.t2 === '')!;
    expect(first).toBeDefined();
    expect(first.j).toBeNull();
    expect(first.n).toBe('1.0000000001');
    expect(first.arr).toEqual(['9007199254740993']);
    expect(first.b).toBe(true);
    expect(first.id).toBe(1);
    // SQL NULL vs JSON null vs JSON string "null" are distinguishable on the server
    const kinds = await pool.query<{ t: string; is_null: boolean; typ: string | null }>(
      `SELECT t, j IS NULL AS is_null, jsonb_typeof(j) AS typ FROM public.${T} WHERE t IN ('json-null','json-str') OR t IS NULL ORDER BY id`
    );
    expect(kinds.rows.map((x) => [x.is_null, x.typ])).toEqual([[true, null], [false, 'null'], [false, 'string']]);
  });

  it('update by pk changes only the set columns and returns the row', async () => {
    const r = await mutateRows(pool, req([{ op: 'update', pk: { id: 1 }, set: { t: 'changed', j: { k: [1, 2] } } }]));
    expect(r.ok).toBe(true);
    const ret = r.results?.[0];
    expect(ret?.rowCount).toBe(1);
    const obj = Object.fromEntries(ret!.fields!.map((f, i) => [f.name, ret!.returning![0]![i]]));
    expect(obj.t).toBe('changed');
    expect(obj.j).toEqual({ k: [1, 2] });
    expect(obj.n).toBe('1.0000000001');
    expect(obj.t2).toBe('');
  });

  it('delete by pk', async () => {
    const before = (await fetchAll(pool)).rows.length;
    const r = await mutateRows(pool, req([{ op: 'delete', pk: { id: 3 } }]));
    expect(r.ok).toBe(true);
    expect(r.results?.[0]?.rowCount).toBe(1);
    expect((await fetchAll(pool)).rows.length).toBe(before - 1);
  });

  it('a failing third op rolls back the first two and reports opIndex', async () => {
    const before = asObjects(await fetchAll(pool));
    const r = await mutateRows(pool, req([
      { op: 'insert', values: { t: 'rb1' } },
      { op: 'update', pk: { id: 1 }, set: { t: 'rb-changed' } },
      { op: 'insert', values: { t: 'rb3', req: null } }
    ]));
    expect(r.ok).toBe(false);
    expect(r.error?.opIndex).toBe(2);
    expect(r.error?.code).toBe('23502');
    expect(r.sqlText).toContain('$1');
    const after = asObjects(await fetchAll(pool));
    expect(after).toEqual(before);
  });

  it('dryRun returns SQL with placeholders and touches nothing', async () => {
    const before = asObjects(await fetchAll(pool));
    const r = await mutateRows(pool, req([{ op: 'insert', values: { t: 'dry' } }], true));
    expect(r.ok).toBe(true);
    expect(r.sqlText).toMatch(/INSERT INTO public\.mut_t \(t\) VALUES \(\$1\) RETURNING \*;/);
    expect(r.sqlText).not.toContain("'dry'");
    expect(asObjects(await fetchAll(pool))).toEqual(before);
  });

  it('a key containing a quote never breaks the query', async () => {
    const r = await mutateRows(pool, req([{ op: 'insert', values: { t: "it's; DROP TABLE public.mut_t; --" } }]));
    expect(r.ok).toBe(true);
    const rows = asObjects(await fetchAll(pool));
    expect(rows.some((x) => x.t === "it's; DROP TABLE public.mut_t; --")).toBe(true);
  });
});
