import { describe, expect, it } from 'vitest';
import {
  BYTEA_OID,
  STRING_ARRAY_OIDS,
  STRING_OIDS,
  createTypeParsers,
  parseStringArray
} from '@main/db/typeParsers';

describe('createTypeParsers', () => {
  const types = createTypeParsers();

  it.each(Object.entries(STRING_OIDS))('keeps %s (oid %i) as a verbatim string', (_name, oid) => {
    const parse = types.getTypeParser(oid as never, 'text') as (v: string) => unknown;
    expect(parse('9007199254740993')).toBe('9007199254740993');
    expect(parse('1.10')).toBe('1.10');
    expect(parse('2026-03-01 10:22:05+03')).toBe('2026-03-01 10:22:05+03');
  });

  it.each(Object.entries(STRING_ARRAY_OIDS))('parses %s (oid %i) into string arrays', (_name, oid) => {
    const parse = types.getTypeParser(oid as never, 'text') as (v: string) => unknown;
    expect(parse('{9007199254740993,1.10}')).toEqual(['9007199254740993', '1.10']);
    expect(parse('{}')).toEqual([]);
  });

  it('turns bytea buffers into \\x hex strings', () => {
    const parse = types.getTypeParser(BYTEA_OID as never, 'text') as (v: string) => unknown;
    expect(parse('\\x0102ff')).toBe('\\x0102ff');
  });

  it('delegates other oids to pg defaults', () => {
    const int4 = types.getTypeParser(23 as never, 'text') as (v: string) => unknown;
    expect(int4('42')).toBe(42);
    const jsonb = types.getTypeParser(3802 as never, 'text') as (v: string) => unknown;
    expect(jsonb('{"a":1}')).toEqual({ a: 1 });
    const bool = types.getTypeParser(16 as never, 'text') as (v: string) => unknown;
    expect(bool('t')).toBe(true);
  });

  it('never registers parsers globally', async () => {
    const { types: globalTypes } = await import('pg');
    const numeric = globalTypes.getTypeParser(1700 as never, 'text') as (v: string) => unknown;
    expect(numeric('1.10')).toBe('1.10'); // pg's own default for numeric is already a string
    const int8 = globalTypes.getTypeParser(20 as never, 'text') as (v: string) => unknown;
    expect(int8('1')).toBe('1');
  });
});

describe('parseStringArray', () => {
  it('handles plain, NULL and quoted elements', () => {
    expect(parseStringArray('{1,2,NULL,"a,b"}')).toEqual(['1', '2', null, 'a,b']);
  });
  it('handles escaped quotes and backslashes', () => {
    expect(parseStringArray('{"say \\"hi\\"","back\\\\slash"}')).toEqual(['say "hi"', 'back\\slash']);
  });
  it('treats quoted NULL as the string NULL', () => {
    expect(parseStringArray('{"NULL",NULL}')).toEqual(['NULL', null]);
  });
  it('handles a single element and empty arrays', () => {
    expect(parseStringArray('{x}')).toEqual(['x']);
    expect(parseStringArray('{}')).toEqual([]);
    expect(parseStringArray('{""}')).toEqual(['']);
  });
  it('skips a dimension prefix', () => {
    expect(parseStringArray('[0:1]={a,b}')).toEqual(['a', 'b']);
  });
});
