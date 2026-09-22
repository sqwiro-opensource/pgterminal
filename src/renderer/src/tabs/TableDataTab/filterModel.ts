/** Pure helpers for the filter bar: operators per type, chip labels, raw WHERE conversion. */
import type { JsonValue } from '@shared/types/query';
import type { Filter, FilterOp, Sort } from '@shared/types/rows';
import { classifyType, type TypeKind } from '@renderer/lib/format';
import { quoteIdent } from '@shared/sql/quote';

export interface OpDef {
  op: FilterOp;
  label: string;
  /** Whether the operator takes a value. */
  takesValue: boolean;
}

const BASE: OpDef[] = [
  { op: 'eq', label: '=', takesValue: true },
  { op: 'neq', label: '≠', takesValue: true },
  { op: 'lt', label: '<', takesValue: true },
  { op: 'lte', label: '≤', takesValue: true },
  { op: 'gt', label: '>', takesValue: true },
  { op: 'gte', label: '≥', takesValue: true },
  { op: 'in', label: 'IN', takesValue: true },
  { op: 'isNull', label: 'IS NULL', takesValue: false },
  { op: 'isNotNull', label: 'IS NOT NULL', takesValue: false }
];
const TEXT_ONLY: OpDef[] = [
  { op: 'like', label: 'LIKE', takesValue: true },
  { op: 'ilike', label: 'ILIKE', takesValue: true }
];
const CONTAINS: OpDef = { op: 'contains', label: '@> contains', takesValue: true };

/** Operators offered for a column type. */
export function operatorsFor(dataType: string): OpDef[] {
  const kind = classifyType(dataType);
  if (kind === 'json') return [CONTAINS, { op: 'eq', label: '=', takesValue: true }, ...BASE.slice(-2)];
  if (kind === 'array') return [CONTAINS, ...BASE.slice(-2)];
  if (kind === 'bool') return [BASE[0]!, BASE[1]!, ...BASE.slice(-2)];
  if (kind === 'text' || kind === 'other' || kind === 'uuid') return [BASE[0]!, BASE[1]!, ...TEXT_ONLY, BASE[6]!, ...BASE.slice(-2)];
  return BASE;
}

export function opLabel(op: FilterOp): string {
  return [...BASE, ...TEXT_ONLY, CONTAINS].find((d) => d.op === op)?.label ?? op;
}

/** Parse the text typed into a chip into the filter value expected by main. */
export function parseFilterValue(op: FilterOp, text: string, dataType: string): JsonValue | undefined {
  const kind: TypeKind = classifyType(dataType);
  if (op === 'isNull' || op === 'isNotNull') return undefined;
  if (op === 'in') return text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (op === 'contains') {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return kind === 'array' ? text.split(',').map((s) => s.trim()) : text;
    }
  }
  if (kind === 'bool') return /^(t|true|1|yes)$/i.test(text.trim());
  return text;
}

function litOf(v: JsonValue | undefined): string {
  if (v === undefined || v === null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return /^-?\d+(\.\d+)?$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`;
}

/** Human/SQL text of one filter (chip label and the raw-WHERE conversion). */
export function filterToSql(f: Filter, dataType?: string): string {
  const col = quoteIdent(f.column);
  switch (f.op) {
    case 'isNull':
      return `${col} IS NULL`;
    case 'isNotNull':
      return `${col} IS NOT NULL`;
    case 'in':
      return `${col} IN (${(Array.isArray(f.value) ? f.value : [f.value]).map((v) => litOf(v as JsonValue)).join(', ')})`;
    case 'contains':
      return `${col} @> ${litOf(f.value)}${dataType && classifyType(dataType) === 'json' ? '::jsonb' : ''}`;
    case 'raw':
      return String(f.value ?? '');
    case 'like':
      return `${col} LIKE ${litOf(f.value)}`;
    case 'ilike':
      return `${col} ILIKE ${litOf(f.value)}`;
    default: {
      const sym: Record<string, string> = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };
      return `${col} ${sym[f.op] ?? f.op} ${litOf(f.value)}`;
    }
  }
}

/** Chips → one raw WHERE text (used when switching to raw mode). */
export function filtersToRaw(filters: Filter[], typeOf: (col: string) => string | undefined): string {
  return filters.map((f) => (f.op === 'raw' ? `(${filterToSql(f)})` : filterToSql(f, typeOf(f.column)))).join(' AND ');
}

/** Chip text. */
export function chipLabel(f: Filter): string {
  if (f.op === 'raw') return `WHERE ${String(f.value ?? '')}`;
  if (f.op === 'isNull' || f.op === 'isNotNull') return `${f.column} ${opLabel(f.op)}`;
  const v = Array.isArray(f.value) ? f.value.join(', ') : typeof f.value === 'object' && f.value !== null ? JSON.stringify(f.value) : String(f.value ?? '');
  return `${f.column} ${opLabel(f.op)} ${v}`;
}

/** Cycle a column's sort: none → asc → desc → none (additive keeps other columns). */
export function cycleSort(sort: Sort[], column: string, additive: boolean): Sort[] {
  const cur = sort.find((s) => s.column === column);
  const rest = additive ? sort.filter((s) => s.column !== column) : [];
  if (!cur) return [...rest, { column, dir: 'asc' }];
  if (cur.dir === 'asc') return [...rest, { column, dir: 'desc' }];
  return rest;
}

/** Whether keyset paging applies (sort empty or exactly the PK, one direction). */
export function isKeysetSort(sort: Sort[], pkColumns: string[]): boolean {
  if (pkColumns.length === 0) return false;
  if (sort.length === 0) return true;
  if (sort.length !== pkColumns.length) return false;
  const dir = sort[0]!.dir;
  return sort.every((s, i) => s.column === pkColumns[i] && s.dir === dir);
}
