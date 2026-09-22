import { describe, expect, it } from 'vitest';
import type { CellValue, FieldInfo } from '@shared/ipc';
import { DEFAULT_SENTINEL } from '@shared/ipc';
import { toCsv, toJson, toSqlInserts } from '@main/export/Exporter';

const f = (name: string, dataType: string): FieldInfo => ({ name, dataType, dataTypeID: 0, tableID: 0, columnID: 0 });
const fields = [f('id', 'int8'), f('n', 'numeric'), f('t', 'text'), f('j', 'jsonb'), f('b', 'bool')];
const BIG = '12345678901234567890.123456789';
const rows: CellValue[][] = [
  ['9007199254740993', BIG, 'say "hi", ok', { a: 1 }, true],
  ['2', null, '', null, false]
];

describe('toCsv', () => {
  it('writes RFC 4180 with CRLF, quotes fields with commas/quotes, NULL empty, numerics bare', () => {
    const csv = toCsv(fields, rows);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('id,n,t,j,b');
    expect(lines[1]).toBe(`9007199254740993,${BIG},"say ""hi"", ok","{""a"":1}",true`);
    expect(lines[2]).toBe('2,,,,false');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it("distinguishes NULL from '' only by position (both empty) but keeps DEFAULT empty", () => {
    expect(toCsv([f('t', 'text')], [[DEFAULT_SENTINEL]])).toBe('t\r\n\r\n');
  });
});

describe('toJson', () => {
  it('emits numeric fields verbatim as bare literals and NULL as null', () => {
    const json = toJson(fields, rows);
    expect(json).toContain(`"n": ${BIG}`);
    expect(json).toContain('"id": 9007199254740993');
    expect(json).toContain('"n": null');
    expect(json).toContain('"t": ""');
    expect(json).toContain('"j": {"a":1}');
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.t).toBe('');
  });
  it('quotes numeric-typed values that are not JSON numbers (NaN, Infinity)', () => {
    expect(toJson([f('x', 'float8')], [['NaN']])).toContain('"x": "NaN"');
  });
});

describe('toSqlInserts', () => {
  it('quotes identifiers and literals, casts jsonb, NULL/DEFAULT keywords', () => {
    const sql = toSqlInserts([f('a"b', 'text'), f('n', 'numeric'), f('j', 'jsonb'), f('d', 'int4')], [["it's", BIG, { x: 1 }, DEFAULT_SENTINEL], [null, null, null, null]], {
      schema: 'sales',
      table: 'Weird Name'
    });
    expect(sql).toContain(`INSERT INTO sales."Weird Name" ("a""b", n, j, d) VALUES ('it''s', ${BIG}, '{"x":1}'::jsonb, DEFAULT);`);
    expect(sql).toContain('VALUES (NULL, NULL, NULL, NULL);');
  });
});
