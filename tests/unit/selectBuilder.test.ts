import { describe, expect, it } from 'vitest';
import type { FetchRowsRequest } from '../../src/shared/ipc';
import { buildCount, buildSelect, isKeysetEligible } from '../../src/main/sql/selectBuilder';

const base: FetchRowsRequest = {
  connectionId: 'c',
  database: 'd',
  schema: 'public',
  table: 'big',
  filters: [],
  sort: [],
  limit: 200,
  page: { mode: 'keyset', after: null }
};
const meta = { pkColumns: ['id'], columnTypes: { id: 'int8', t: 'text', j: 'jsonb' } };

function placeholders(text: string): number[] {
  return [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
}

describe('buildSelect', () => {
  it('first keyset page: default PK sort, LIMIT limit+1, no boundary', () => {
    const b = buildSelect(base, meta);
    expect(b.text).toBe('SELECT * FROM public.big ORDER BY id ASC LIMIT $1');
    expect(b.values).toEqual([201]);
    expect(b.keyset).toBe(true);
    expect(b.reversed).toBe(false);
  });

  it('keyset after: tuple comparison with > for asc (PROP-09)', () => {
    const b = buildSelect({ ...base, page: { mode: 'keyset', after: { id: '200' } } }, meta);
    expect(b.text).toBe('SELECT * FROM public.big WHERE (id) > ($1) ORDER BY id ASC LIMIT $2');
    expect(b.values).toEqual(['200', 201]);
  });

  it('keyset before: flipped comparison, reversed order, reversed flag (PROP-09)', () => {
    const b = buildSelect({ ...base, page: { mode: 'keyset', after: null, before: { id: '401' } } }, meta);
    expect(b.text).toBe('SELECT * FROM public.big WHERE (id) < ($1) ORDER BY id DESC LIMIT $2');
    expect(b.reversed).toBe(true);
  });

  it('keyset with desc sort uses < after the boundary', () => {
    const b = buildSelect(
      { ...base, sort: [{ column: 'id', dir: 'desc' }], page: { mode: 'keyset', after: { id: '5' } } },
      meta
    );
    expect(b.text).toBe('SELECT * FROM public.big WHERE (id) < ($1) ORDER BY id DESC LIMIT $2');
  });

  it('composite primary key produces a tuple comparison', () => {
    const b = buildSelect(
      { ...base, page: { mode: 'keyset', after: { a: 1, b: 'x' } } },
      { pkColumns: ['a', 'b'], columnTypes: {} }
    );
    expect(b.text).toBe('SELECT * FROM public.big WHERE (a, b) > ($1, $2) ORDER BY a ASC, b ASC LIMIT $3');
    expect(b.values).toEqual([1, 'x', 201]);
  });

  it('non-PK sort in keyset mode falls back to offset semantics (keyset:false)', () => {
    const b = buildSelect({ ...base, sort: [{ column: 't', dir: 'desc' }] }, meta);
    expect(b.keyset).toBe(false);
    expect(b.text).toBe('SELECT * FROM public.big ORDER BY t DESC LIMIT $1');
  });

  it('offset mode adds OFFSET as a parameter and honours NULLS FIRST', () => {
    const b = buildSelect(
      { ...base, sort: [{ column: 't', dir: 'asc', nullsFirst: true }], page: { mode: 'offset', offset: 400 } },
      meta
    );
    expect(b.text).toBe('SELECT * FROM public.big ORDER BY t ASC NULLS FIRST LIMIT $1 OFFSET $2');
    expect(b.values).toEqual([201, 400]);
  });

  it('filters come before the keyset boundary; placeholders are contiguous (PROP-07)', () => {
    const b = buildSelect(
      {
        ...base,
        filters: [{ column: 't', op: 'ilike', value: 'row 1%' }, { column: 'j', op: 'contains', value: { i: 1 } }],
        page: { mode: 'keyset', after: { id: '10' } }
      },
      meta
    );
    expect(b.text).toBe(
      'SELECT * FROM public.big WHERE t ILIKE $1 AND j @> $2::jsonb AND (id) > ($3) ORDER BY id ASC LIMIT $4'
    );
    expect(placeholders(b.text)).toEqual([1, 2, 3, 4]);
    expect(b.values).toEqual(['row 1%', '{"i":1}', '10', 201]);
    expect(b.text).not.toContain('row 1%');
  });

  it('quotes column projections, schema and table (PROP-06)', () => {
    const b = buildSelect(
      { ...base, schema: 'My Schema', table: 'Weird"Name', columns: ['a"b', 'Select', 'plain'] },
      { pkColumns: [], columnTypes: {} }
    );
    expect(b.text).toBe('SELECT "a""b", "Select", plain FROM "My Schema"."Weird""Name" ORDER BY ctid ASC LIMIT $1');
    expect(b.keyset).toBe(false);
  });

  it('throws when the boundary lacks a PK column', () => {
    expect(() => buildSelect({ ...base, page: { mode: 'keyset', after: { nope: 1 } } }, meta)).toThrow(/primary key/);
  });

  it('isKeysetEligible requires the exact PK columns with one direction', () => {
    expect(isKeysetEligible([{ column: 'id', dir: 'asc' }], ['id'])).toBe(true);
    expect(isKeysetEligible([{ column: 'a', dir: 'asc' }, { column: 'b', dir: 'desc' }], ['a', 'b'])).toBe(false);
    expect(isKeysetEligible([], ['id'])).toBe(false);
  });

  it('buildCount composes a parameterised count', () => {
    const c = buildCount('sales', 'sales_customer', [{ column: 'email', op: 'eq', value: null }], {});
    expect(c.text).toBe('SELECT count(*)::text AS n FROM sales.sales_customer WHERE email IS NULL');
    expect(c.values).toEqual([]);
  });
});
