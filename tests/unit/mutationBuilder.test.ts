import { describe, expect, it } from 'vitest';
import { DEFAULT_SENTINEL } from '../../src/shared/ipc';
import { buildDelete, buildInsert, buildUpdate } from '../../src/main/sql/mutationBuilder';

const types = { id: 'int4', t: 'text', j: 'jsonb', arr: '_int8', n: 'numeric' };

describe('buildInsert', () => {
  it('DEFAULT sentinel renders the keyword and consumes no parameter; jsonb and arrays are cast', () => {
    const b = buildInsert('public', 'mut_t', { id: DEFAULT_SENTINEL, t: "O'Brien", j: { a: 1 }, arr: ['9007199254740993'], n: '1.10' }, types);
    expect(b.text).toBe(
      'INSERT INTO public.mut_t (id, t, j, arr, n) VALUES (DEFAULT, $1, $2::jsonb, $3::int8[], $4) RETURNING *'
    );
    expect(b.values).toEqual(["O'Brien", '{"a":1}', ['9007199254740993'], '1.10']);
    expect(b.text).not.toContain("O'Brien");
  });

  it('null is SQL NULL via a parameter; empty string stays empty; JSON null is raw text', () => {
    const b = buildInsert('public', 'mut_t', { t: null, t2: '', j: 'null' }, types);
    expect(b.text).toBe('INSERT INTO public.mut_t (t, t2, j) VALUES ($1, $2, $3::jsonb) RETURNING *');
    expect(b.values).toEqual([null, '', 'null']);
  });

  it('no columns → DEFAULT VALUES', () => {
    expect(buildInsert('s', 't', {}).text).toBe('INSERT INTO s.t DEFAULT VALUES RETURNING *');
  });

  it('quotes identifiers (PROP-06)', () => {
    const b = buildInsert('My Schema', 'Weird"Name', { 'a"b': 1, Select: 2, 'x y': 3 });
    expect(b.text).toBe('INSERT INTO "My Schema"."Weird""Name" ("a""b", "Select", "x y") VALUES ($1, $2, $3) RETURNING *');
  });
});

describe('buildUpdate', () => {
  it('targets the row by every PK column and returns it (PROP-10)', () => {
    const b = buildUpdate('sales', 'sales_customer', { id: 42 }, { name: 'Acme', j: [1, 2] }, { j: 'jsonb' });
    expect(b.text).toBe('UPDATE sales.sales_customer SET name = $1, j = $2::jsonb WHERE id = $3 RETURNING *');
    expect(b.values).toEqual(['Acme', '[1,2]', 42]);
  });

  it('composite keys AND every column; placeholders contiguous (PROP-07)', () => {
    const b = buildUpdate('s', 't', { a: 1, b: 'x' }, { c: null });
    expect(b.text).toBe('UPDATE s.t SET c = $1 WHERE a = $2 AND b = $3 RETURNING *');
    expect([...b.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]))).toEqual([1, 2, 3]);
    expect(b.values.length).toBe(3);
  });

  it('refuses a missing or null primary key and an empty SET', () => {
    expect(() => buildUpdate('s', 't', {}, { c: 1 })).toThrow(/primary key/);
    expect(() => buildUpdate('s', 't', { id: null }, { c: 1 })).toThrow(/no value/);
    expect(() => buildUpdate('s', 't', { id: 1 }, {})).toThrow(/no columns/);
  });
});

describe('buildDelete', () => {
  it('deletes by full PK only (PROP-10)', () => {
    const b = buildDelete('s', 't', { id: 7 });
    expect(b.text).toBe('DELETE FROM s.t WHERE id = $1 RETURNING *');
    expect(b.values).toEqual([7]);
    expect(() => buildDelete('s', 't', {})).toThrow(/primary key/);
  });
});
