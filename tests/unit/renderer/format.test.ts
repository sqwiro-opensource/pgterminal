import { describe, expect, it } from 'vitest';
import {
  classifyType,
  formatBytesShort,
  formatCell,
  formatNumber,
  isLinkShaped,
  jsonPreview,
  parseArrayLiteral,
  setLinkDetector
} from '../../../src/renderer/src/lib/format';
import { DEFAULT_SENTINEL } from '../../../src/shared/types/query';

describe('classifyType', () => {
  it('maps pg type names to kinds', () => {
    expect(classifyType('int4')).toBe('number');
    expect(classifyType('int8')).toBe('number');
    expect(classifyType('numeric')).toBe('number');
    expect(classifyType('numeric(18,2)')).toBe('number');
    expect(classifyType('float8')).toBe('number');
    expect(classifyType('money')).toBe('number');
    expect(classifyType('bool')).toBe('bool');
    expect(classifyType('boolean')).toBe('bool');
    expect(classifyType('date')).toBe('time');
    expect(classifyType('time')).toBe('time');
    expect(classifyType('timetz')).toBe('time');
    expect(classifyType('timestamp')).toBe('time');
    expect(classifyType('timestamptz')).toBe('time');
    expect(classifyType('timestamp with time zone')).toBe('time');
    expect(classifyType('interval')).toBe('time');
    expect(classifyType('uuid')).toBe('uuid');
    expect(classifyType('json')).toBe('json');
    expect(classifyType('jsonb')).toBe('json');
    expect(classifyType('bytea')).toBe('bytea');
    expect(classifyType('_int4')).toBe('array');
    expect(classifyType('int4[]')).toBe('array');
    expect(classifyType('text[]')).toBe('array');
    expect(classifyType('text')).toBe('text');
    expect(classifyType('varchar')).toBe('text');
    expect(classifyType('bpchar')).toBe('text');
    expect(classifyType('name')).toBe('text');
    expect(classifyType('citext')).toBe('text');
    expect(classifyType('tsvector')).toBe('other');
  });
});

describe('formatCell', () => {
  it('distinguishes NULL, empty string, the string "null" and JSON null', () => {
    expect(formatCell(null, 'text')).toEqual({ text: 'NULL', kind: 'null' });
    expect(formatCell('', 'text')).toEqual({ text: '', kind: 'empty', title: 'empty string' });
    expect(formatCell('null', 'text')).toEqual({ text: 'null', kind: 'text' });
    expect(formatCell(null, 'jsonb')).toEqual({ text: 'NULL', kind: 'null' });
    expect(formatCell({ a: null }, 'jsonb').text).toBe('{a:null}');
  });
  it('keeps numeric strings exact', () => {
    expect(formatCell('1.10', 'numeric').text).toBe('1.10');
    expect(formatCell('9007199254740993', 'int8').text).toBe('9007199254740993');
    expect(formatCell('1.10', 'numeric').kind).toBe('number');
    expect(formatCell(42, 'int4')).toEqual({ text: '42', kind: 'number' });
  });
  it('renders booleans, times, uuids', () => {
    expect(formatCell(true, 'bool')).toEqual({ text: 'true', kind: 'bool' });
    expect(formatCell('f', 'bool').text).toBe('false');
    const ts = formatCell('2026-03-01T10:22:05.123+03:00', 'timestamptz');
    expect(ts.text).toBe('2026-03-01 10:22:05.123');
    expect(ts.title).toBe('2026-03-01T10:22:05.123+03:00');
    expect(formatCell('2026-03-01', 'date')).toEqual({ text: '2026-03-01', kind: 'time' });
    expect(formatCell('1 day 02:00:00', 'interval').text).toBe('1 day 02:00:00');
    expect(formatCell('7d2a1b7e-1111-4222-8333-444455556666', 'uuid').kind).toBe('uuid');
  });
  it('previews jsonb on one line', () => {
    const v = { tier: 'gold', tags: ['a', 'b', 'c'], owner: { id: 3, name: 'x' }, 'odd key': 1 };
    expect(formatCell(v, 'jsonb').text).toBe('{tier:"gold", tags:[3], owner:{2}, "odd key":1}');
    expect(formatCell([1, 2, { a: 1 }], 'json').text).toBe('[1, 2, {1}]');
    const long = { s: 'x'.repeat(300) };
    const f = formatCell(long, 'jsonb');
    expect(f.text.length).toBeLessThanOrEqual(120);
    expect(f.text.endsWith('…')).toBe(true);
    expect(f.title).toBe(JSON.stringify(long));
  });
  it('renders bytea with size', () => {
    const f = formatCell(`\\x${'ab'.repeat(700)}`, 'bytea');
    expect(f.text).toBe('\\xabababababab… (700 B)');
    expect(f.title).toBe('700 bytes');
    expect(formatCell('\\x1a2b', 'bytea').text).toBe('\\x1a2b (2 B)');
  });
  it('renders arrays with a count', () => {
    const f = formatCell('{1,2,NULL,"a,b"}', '_text');
    expect(f.text).toBe('{1,2,NULL,a,b}');
    expect(f.title).toContain('4 items');
    expect(formatCell('{}', 'int4[]').title).toContain('0 items');
  });
  it('truncates long text and keeps the full value as title', () => {
    const s = 'y'.repeat(250);
    const f = formatCell(s, 'text');
    expect(f.text).toBe(`${'y'.repeat(200)}…`);
    expect(f.title).toBe(s);
    expect(formatCell('short', 'varchar')).toEqual({ text: 'short', kind: 'text' });
  });
  it('renders DEFAULT and unknown types', () => {
    expect(formatCell(DEFAULT_SENTINEL, 'int4')).toEqual({ text: 'DEFAULT', kind: 'default' });
    expect(formatCell('x', 'tsvector').kind).toBe('other');
  });
});

describe('helpers', () => {
  it('formatNumber adds separators for display only', () => {
    expect(formatNumber('1203441')).toBe('1,203,441');
    expect(formatNumber('-1234.5678')).toBe('-1,234.5678');
    expect(formatNumber('abc')).toBe('abc');
    expect(formatNumber('9007199254740993')).toBe('9,007,199,254,740,993');
  });
  it('formatBytesShort', () => {
    expect(formatBytesShort(700)).toBe('700 B');
    expect(formatBytesShort(1229)).toBe('1.2 KB');
    expect(formatBytesShort(12.4 * 1024 * 1024 * 1024)).toBe('12.4 GB');
  });
  it('jsonPreview handles scalars', () => {
    expect(jsonPreview(null)).toBe('null');
    expect(jsonPreview('s')).toBe('"s"');
    expect(jsonPreview(3)).toBe('3');
  });
  it('parseArrayLiteral handles quotes, escapes and NULL', () => {
    expect(parseArrayLiteral('{a,"b c","d\\"e",NULL}')).toEqual(['a', 'b c', 'd"e', null]);
    expect(parseArrayLiteral('{}')).toEqual([]);
    expect(parseArrayLiteral('not an array')).toEqual(['not an array']);
  });
  it('isLinkShaped is a replaceable hook', () => {
    expect(isLinkShaped('users/42')).toBe(false);
    setLinkDetector((v) => typeof v === 'string' && v.includes('/'));
    // re-import the live binding through the module namespace
    return import('../../../src/renderer/src/lib/format').then((m) => {
      expect(m.isLinkShaped('users/42')).toBe(true);
      m.setLinkDetector(() => false);
    });
  });
});
