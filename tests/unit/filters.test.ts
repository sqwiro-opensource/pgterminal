import { describe, expect, it } from 'vitest';
import { ParamSink, buildWhere } from '../../src/main/sql/filters';

describe('buildWhere', () => {
  it('quotes identifiers only through pg-format %I (PROP-06)', () => {
    const p = new ParamSink();
    const sql = buildWhere(
      [
        { column: 'a"b', op: 'eq', value: 1 },
        { column: 'Select', op: 'gt', value: 2 },
        { column: 'naïve', op: 'lt', value: 3 },
        { column: 'x y', op: 'gte', value: 4 },
        { column: 'plain', op: 'lte', value: 5 }
      ],
      p
    );
    expect(sql).toBe('"a""b" = $1 AND "Select" > $2 AND "naïve" < $3 AND "x y" >= $4 AND plain <= $5');
    expect(p.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('never embeds values; placeholders are 1..N without gaps (PROP-07)', () => {
    const p = new ParamSink();
    const sql = buildWhere(
      [
        { column: 'name', op: 'ilike', value: "%O'Brien%" },
        { column: 'id', op: 'in', value: [1, 2, 3] },
        { column: 'meta', op: 'contains', value: { tier: 'gold' } }
      ],
      p,
      { meta: 'jsonb' }
    );
    expect(sql).toBe('name ILIKE $1 AND id = ANY($2) AND meta @> $3::jsonb');
    expect(sql).not.toContain("O'Brien");
    expect(sql).not.toContain('gold');
    expect(p.values).toEqual(["%O'Brien%", [1, 2, 3], '{"tier":"gold"}']);
    const ns = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(ns).toEqual([1, 2, 3]);
    expect(p.values.length).toBe(3);
  });

  it('eq null → IS NULL and neq null → IS NOT NULL without parameters (PROP-08)', () => {
    const p = new ParamSink();
    expect(buildWhere([{ column: 'email', op: 'eq', value: null }, { column: 'x', op: 'neq', value: null }], p)).toBe(
      'email IS NULL AND x IS NOT NULL'
    );
    expect(p.values).toEqual([]);
    expect(buildWhere([{ column: 'e', op: 'isNull' }, { column: 'f', op: 'isNotNull' }], new ParamSink())).toBe(
      'e IS NULL AND f IS NOT NULL'
    );
  });

  it('in with an empty list is FALSE', () => {
    const p = new ParamSink();
    expect(buildWhere([{ column: 'id', op: 'in', value: [] }], p)).toBe('FALSE');
    expect(p.values).toEqual([]);
  });

  it('contains on array columns casts the parameter to the array type', () => {
    const p = new ParamSink();
    expect(buildWhere([{ column: 'tags', op: 'contains', value: ['a'] }], p, { tags: '_text' })).toBe('tags @> $1::text[]');
    expect(p.values).toEqual([['a']]);
  });

  it('raw fragments are appended verbatim in parentheses and get no parameters', () => {
    const p = new ParamSink();
    expect(buildWhere([{ column: '', op: 'raw', value: "country = 'KE' OR country = 'UG'" }], p)).toBe(
      "(country = 'KE' OR country = 'UG')"
    );
    expect(p.values).toEqual([]);
    expect(buildWhere([{ column: '', op: 'raw', value: '   ' }], p)).toBe('');
  });

  it('returns an empty string for no filters', () => {
    expect(buildWhere([], new ParamSink())).toBe('');
  });
});
