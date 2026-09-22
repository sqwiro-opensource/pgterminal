import { isDefaultSentinel, type CellValue, type JsonValue } from '@shared/types/query';

/** Broad rendering class derived from a pg type name. */
export type TypeKind = 'number' | 'bool' | 'time' | 'uuid' | 'json' | 'bytea' | 'array' | 'text' | 'other';

/** Rendering class of a formatted cell (type kind plus value-level cases). */
export type CellKind = TypeKind | 'null' | 'empty' | 'default';

export interface FormattedCell {
  text: string;
  kind: CellKind;
  /** Full / raw value for a tooltip when `text` is abbreviated or converted. */
  title?: string;
}

const NUMBER_TYPES = new Set([
  'int2', 'int4', 'int8', 'smallint', 'integer', 'bigint', 'numeric', 'decimal', 'float4', 'float8',
  'real', 'double precision', 'money', 'oid', 'xid', 'cid', 'serial', 'bigserial', 'smallserial'
]);
const TIME_TYPES = new Set([
  'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval',
  'time without time zone', 'time with time zone', 'timestamp without time zone', 'timestamp with time zone'
]);
const TEXT_TYPES = new Set(['text', 'varchar', 'character varying', 'bpchar', 'character', 'char', 'name', 'citext', 'xml']);

/** Classify a pg type name (as reported in FieldInfo.dataType) into a rendering kind. */
export function classifyType(dataType: string): TypeKind {
  const t = dataType.trim().toLowerCase();
  if (t.startsWith('_') || t.endsWith('[]')) return 'array';
  const base = t.replace(/\(.*\)$/, '').trim();
  if (NUMBER_TYPES.has(base)) return 'number';
  if (base === 'bool' || base === 'boolean') return 'bool';
  if (TIME_TYPES.has(base)) return 'time';
  if (base === 'uuid') return 'uuid';
  if (base === 'json' || base === 'jsonb') return 'json';
  if (base === 'bytea') return 'bytea';
  if (TEXT_TYPES.has(base)) return 'text';
  return 'other';
}

/** Element type name of an array type (`_int4` → `int4`, `text[]` → `text`). */
export function arrayElementType(dataType: string): string {
  const t = dataType.trim();
  if (t.startsWith('_')) return t.slice(1);
  if (t.endsWith('[]')) return t.slice(0, -2);
  return t;
}

/** Thousands separators for display only. Never alters the stored string. */
export function formatNumber(text: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(text);
  if (!m) return text;
  const int = (m[2] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${m[1] ?? ''}${int}${m[3] ?? ''}`;
}

/** 1.2 KB / 3.4 MB style. */
export function formatBytesShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 100 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v))} ${units[i]}`;
}

function previewValue(v: JsonValue, depth: number, max: number): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (depth >= 1) return `[${v.length}]`;
    const parts: string[] = [];
    for (const item of v) {
      parts.push(previewValue(item, depth + 1, max));
      if (parts.join(', ').length > max) break;
    }
    return `[${parts.join(', ')}]`;
  }
  const keys = Object.keys(v);
  if (depth >= 1) return `{${keys.length}}`;
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}:${previewValue(v[k] as JsonValue, depth + 1, max)}`);
    if (parts.join(', ').length > max) break;
  }
  return `{${parts.join(', ')}}`;
}

/** One-line JSON preview: keys unquoted, strings quoted, nested arrays `[n]`, nested objects `{n}`. */
export function jsonPreview(value: JsonValue, max = 120): string {
  const s = previewValue(value, 0, max);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Parse a pg array literal (`{a,b,NULL,"c,d"}`) into display elements. */
export function parseArrayLiteral(text: string): Array<string | null> {
  const out: Array<string | null> = [];
  const s = text.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return [s];
  const body = s.slice(1, -1);
  if (body === '') return out;
  let i = 0;
  while (i <= body.length) {
    if (body[i] === '"') {
      let j = i + 1;
      let cur = '';
      while (j < body.length && body[j] !== '"') {
        if (body[j] === '\\' && j + 1 < body.length) j++;
        cur += body[j];
        j++;
      }
      out.push(cur);
      i = j + 1;
      if (body[i] === ',') i++;
      else if (i >= body.length) break;
    } else {
      let j = body.indexOf(',', i);
      if (j === -1) j = body.length;
      const raw = body.slice(i, j).trim();
      out.push(raw === 'NULL' ? null : raw);
      i = j + 1;
      if (j >= body.length) break;
    }
  }
  return out;
}

/** Hook point for Phase 4: the DocRef parser replaces this. */
export let isLinkShaped: (value: unknown) => boolean = () => false;

/** Install the link detector (Phase 4). */
export function setLinkDetector(fn: (value: unknown) => boolean): void {
  isLinkShaped = fn;
}

const TEXT_MAX = 200;

function timeDisplay(raw: string): { text: string; title?: string } {
  // Only ISO-like timestamps get a compact local rendering; dates, times and intervals pass through.
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(raw);
  if (!m) return { text: raw };
  return { text: `${m[1]} ${m[2]}${m[3] ?? ''}`, title: raw };
}

/** Format a cell for display according to its column type and value. */
export function formatCell(value: CellValue, dataType: string): FormattedCell {
  if (value === null || value === undefined) return { text: 'NULL', kind: 'null' };
  if (isDefaultSentinel(value)) return { text: 'DEFAULT', kind: 'default' };
  const kind = classifyType(dataType);
  if (kind === 'json') {
    const preview = jsonPreview(value as JsonValue);
    return { text: preview, kind, title: preview.endsWith('…') ? JSON.stringify(value) : undefined };
  }
  if (typeof value === 'object') {
    // Non-json columns should never carry objects, but never crash on them.
    const text = jsonPreview(value as JsonValue);
    return { text, kind: 'other', title: JSON.stringify(value) };
  }
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false', kind: 'bool' };
  if (typeof value === 'number') return { text: String(value), kind: 'number' };
  const str = value;
  if (str === '') return { text: '', kind: 'empty', title: 'empty string' };
  switch (kind) {
    case 'number':
      return { text: str, kind };
    case 'bool':
      return { text: str === 't' || str === 'true' ? 'true' : str === 'f' || str === 'false' ? 'false' : str, kind };
    case 'time': {
      const d = timeDisplay(str);
      return d.title ? { text: d.text, kind, title: d.title } : { text: d.text, kind };
    }
    case 'uuid':
      return { text: str, kind };
    case 'bytea': {
      const hex = str.startsWith('\\x') ? str.slice(2) : str;
      const bytes = Math.floor(hex.length / 2);
      const head = hex.slice(0, 12);
      return { text: `\\x${head}${hex.length > 12 ? '…' : ''} (${formatBytesShort(bytes)})`, kind, title: `${bytes} bytes` };
    }
    case 'array': {
      const items = parseArrayLiteral(str);
      const shown = items.slice(0, 8).map((x) => (x === null ? 'NULL' : x)).join(',');
      const text = `{${shown}${items.length > 8 ? ',…' : ''}}`;
      return { text, kind, title: `${items.length} item${items.length === 1 ? '' : 's'}: ${str}` };
    }
    default: {
      if (str.length > TEXT_MAX) return { text: `${str.slice(0, TEXT_MAX)}…`, kind: kind === 'other' ? 'other' : 'text', title: str };
      return { text: str, kind: kind === 'other' ? 'other' : 'text' };
    }
  }
}
