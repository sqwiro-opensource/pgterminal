import { types } from 'pg';
import type { CustomTypesConfig } from 'pg';

/**
 * Per-pool type parsers. Passed as the `types` option of every Pool so nothing is ever
 * registered globally with `pg.types.setTypeParser`.
 *
 * Rules (see CellValue in shared/types/query.ts): int8, numeric, money, date, time, timetz,
 * timestamp, timestamptz and interval stay strings; their arrays become string[]; bytea becomes a
 * `\x…` hex string. Everything else uses pg's defaults (json/jsonb parsed, int4 → number, …).
 */

/** Scalar oids that must be returned verbatim as strings. */
export const STRING_OIDS: Record<string, number> = {
  int8: 20,
  numeric: 1700,
  money: 790,
  date: 1082,
  time: 1083,
  timetz: 1266,
  timestamp: 1114,
  timestamptz: 1184,
  interval: 1186
};

/** Array oids whose elements must stay strings. */
export const STRING_ARRAY_OIDS: Record<string, number> = {
  _int8: 1016,
  _numeric: 1231,
  _money: 791,
  _date: 1182,
  _time: 1183,
  _timetz: 1270,
  _timestamp: 1115,
  _timestamptz: 1185,
  _interval: 1187
};

export const BYTEA_OID = 17;

const identity = (v: string): string => v;

/**
 * Minimal parser for one-dimensional PostgreSQL array literals in text format:
 * `{1,2,NULL,"a,b"}` → ['1','2',null,'a,b']. Quoted elements may contain `\"` and `\\`.
 */
export function parseStringArray(text: string): (string | null)[] {
  if (text === '' || text === '{}') return [];
  let i = 0;
  // Skip an optional dimension prefix like [1:3]=
  if (text[0] === '[') {
    const eq = text.indexOf('=');
    if (eq !== -1) i = eq + 1;
  }
  if (text[i] !== '{') throw new Error(`Not an array literal: ${text}`);
  i++;
  const out: (string | null)[] = [];
  let cur = '';
  let quoted = false;
  let sawQuote = false;
  const flush = (): void => {
    if (!sawQuote && cur === 'NULL') out.push(null);
    else out.push(cur);
    cur = '';
    sawQuote = false;
  };
  for (; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '\\') {
        cur += text[i + 1] ?? '';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      sawQuote = true;
    } else if (ch === ',') {
      flush();
    } else if (ch === '}') {
      if (cur !== '' || sawQuote || out.length > 0) flush();
      break;
    } else {
      cur += ch;
    }
  }
  return out;
}

function byteaToHex(v: string | Buffer): string {
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex');
  // Text format is already `\x…` (or the legacy escape format); return verbatim.
  return v;
}

/** Build the `types` config for one Pool. */
export function createTypeParsers(): CustomTypesConfig {
  const stringOids = new Set(Object.values(STRING_OIDS));
  const stringArrayOids = new Set(Object.values(STRING_ARRAY_OIDS));
  return {
    getTypeParser(oid: number, format?: 'text' | 'binary') {
      const fmt = format ?? 'text';
      if (fmt === 'text') {
        if (stringOids.has(oid)) return identity;
        if (stringArrayOids.has(oid)) return parseStringArray;
        if (oid === BYTEA_OID) {
          const base = types.getTypeParser(oid, fmt) as (v: string) => Buffer;
          return (v: string) => byteaToHex(base(v));
        }
      }
      return types.getTypeParser(oid as never, fmt);
    }
  } as CustomTypesConfig;
}
