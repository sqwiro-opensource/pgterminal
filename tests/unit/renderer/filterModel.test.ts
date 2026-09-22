import { describe, expect, it } from 'vitest';
import { chipLabel, cycleSort, filterToSql, filtersToRaw, isKeysetSort, operatorsFor, parseFilterValue } from '../../../src/renderer/src/tabs/TableDataTab/filterModel';

describe('filterModel', () => {
  it('offers operators by type', () => {
    expect(operatorsFor('jsonb').map((o) => o.op)).toEqual(['contains', 'eq', 'isNull', 'isNotNull']);
    expect(operatorsFor('text').map((o) => o.op)).toContain('ilike');
    expect(operatorsFor('int4').map((o) => o.op)).not.toContain('ilike');
    expect(operatorsFor('bool').map((o) => o.op)).toEqual(['eq', 'neq', 'isNull', 'isNotNull']);
  });
  it('parses typed values', () => {
    expect(parseFilterValue('in', '1, 2,3', 'int4')).toEqual(['1', '2', '3']);
    expect(parseFilterValue('contains', '{"tier":"gold"}', 'jsonb')).toEqual({ tier: 'gold' });
    expect(parseFilterValue('contains', 'a,b', 'text[]')).toEqual(['a', 'b']);
    expect(parseFilterValue('eq', 'true', 'bool')).toBe(true);
    expect(parseFilterValue('isNull', 'x', 'text')).toBeUndefined();
    expect(parseFilterValue('eq', '1.10', 'numeric')).toBe('1.10');
  });
  it('renders SQL text for chips and raw conversion with quoting', () => {
    expect(filterToSql({ column: 'name', op: 'ilike', value: "%o'b%" })).toBe("name ILIKE '%o''b%'");
    expect(filterToSql({ column: 'Weird', op: 'eq', value: '3' })).toBe('"Weird" = 3');
    expect(filterToSql({ column: 'meta', op: 'contains', value: { tier: 'gold' } }, 'jsonb')).toBe(`meta @> '{"tier":"gold"}'::jsonb`);
    expect(filterToSql({ column: 'id', op: 'in', value: ['1', '2'] })).toBe('id IN (1, 2)');
    expect(filtersToRaw([{ column: 'a', op: 'isNull' }, { column: 'b', op: 'raw', value: 'x > 1' }], () => 'text')).toBe('a IS NULL AND (x > 1)');
    expect(chipLabel({ column: 'country', op: 'eq', value: 'KE' })).toBe('country = KE');
  });
  it('cycles sort and detects keyset eligibility', () => {
    let s = cycleSort([], 'id', false);
    expect(s).toEqual([{ column: 'id', dir: 'asc' }]);
    s = cycleSort(s, 'id', false);
    expect(s[0]?.dir).toBe('desc');
    expect(cycleSort(s, 'id', false)).toEqual([]);
    expect(isKeysetSort([], ['id'])).toBe(true);
    expect(isKeysetSort([{ column: 'id', dir: 'desc' }], ['id'])).toBe(true);
    expect(isKeysetSort([{ column: 'name', dir: 'asc' }], ['id'])).toBe(false);
    expect(isKeysetSort([], [])).toBe(false);
  });
});
