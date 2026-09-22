/**
 * Pure pending-changes buffer for a table grid: updates keyed by row key, inserts and deletes.
 * Values keep the CellValue rules (null = SQL NULL, '' = empty string, DEFAULT_SENTINEL = keyword).
 */
import { DEFAULT_SENTINEL, isDefaultSentinel, type CellValue, type FieldInfo, type JsonValue } from '@shared/types/query';
import type { RowOp } from '@shared/types/rows';
import { classifyType } from '@renderer/lib/format';

export interface RowUpdate {
  /** Original row (array form) — used for the PK and revert. */
  original: CellValue[];
  set: Record<string, CellValue>;
}

export interface EditBuffer {
  updates: Record<string, RowUpdate>;
  inserts: Array<Record<string, CellValue>>;
  deletes: string[];
}

export const EMPTY_BUFFER: EditBuffer = { updates: {}, inserts: [], deletes: [] };

export function isDirty(b: EditBuffer): boolean {
  return Object.keys(b.updates).length > 0 || b.inserts.length > 0 || b.deletes.length > 0;
}

export function changeCount(b: EditBuffer): number {
  return Object.values(b.updates).reduce((n, u) => n + Object.keys(u.set).length, 0) + b.inserts.length + b.deletes.length;
}

function sameValue(a: CellValue | undefined, b: CellValue): boolean {
  if (a === undefined) return b === null;
  if (isDefaultSentinel(a) || isDefaultSentinel(b)) return isDefaultSentinel(a) && isDefaultSentinel(b);
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** Set one cell; setting it back to its original value drops the pending entry. */
export function setCell(b: EditBuffer, rowKey: string, original: CellValue[], colIndex: number, colName: string, value: CellValue): EditBuffer {
  const existing = b.updates[rowKey];
  const set = { ...(existing?.set ?? {}) };
  if (sameValue(original[colIndex], value)) delete set[colName];
  else set[colName] = value;
  const updates = { ...b.updates };
  if (Object.keys(set).length === 0) delete updates[rowKey];
  else updates[rowKey] = { original, set };
  return { ...b, updates };
}

export function revertCell(b: EditBuffer, rowKey: string, colName: string): EditBuffer {
  const existing = b.updates[rowKey];
  if (!existing || !(colName in existing.set)) return b;
  const set = { ...existing.set };
  delete set[colName];
  const updates = { ...b.updates };
  if (Object.keys(set).length === 0) delete updates[rowKey];
  else updates[rowKey] = { ...existing, set };
  return { ...b, updates };
}

export function setNull(b: EditBuffer, rowKey: string, original: CellValue[], colIndex: number, colName: string): EditBuffer {
  return setCell(b, rowKey, original, colIndex, colName, null);
}

export function setDefault(b: EditBuffer, rowKey: string, original: CellValue[], colIndex: number, colName: string): EditBuffer {
  return setCell(b, rowKey, original, colIndex, colName, DEFAULT_SENTINEL);
}

export function markDelete(b: EditBuffer, rowKey: string): EditBuffer {
  if (b.deletes.includes(rowKey)) return b;
  return { ...b, deletes: [...b.deletes, rowKey] };
}

export function unmarkDelete(b: EditBuffer, rowKey: string): EditBuffer {
  return { ...b, deletes: b.deletes.filter((k) => k !== rowKey) };
}

export function addInsert(b: EditBuffer, values: Record<string, CellValue>): EditBuffer {
  return { ...b, inserts: [...b.inserts, values] };
}

export function updateInsert(b: EditBuffer, index: number, patch: Record<string, CellValue>): EditBuffer {
  const inserts = b.inserts.map((row, i) => (i === index ? { ...row, ...patch } : row));
  return { ...b, inserts };
}

export function removeInsert(b: EditBuffer, index: number): EditBuffer {
  return { ...b, inserts: b.inserts.filter((_, i) => i !== index) };
}

/** Pending value of a cell, or `undefined` when unchanged. */
export function pendingValue(b: EditBuffer, rowKey: string, colName: string): CellValue | undefined {
  const u = b.updates[rowKey];
  return u && colName in u.set ? u.set[colName] : undefined;
}

/** Keys of every pending cell as `${rowKey}:${colName}`. */
export function pendingCellKeys(b: EditBuffer): Set<string> {
  const out = new Set<string>();
  for (const [rowKey, u] of Object.entries(b.updates)) for (const col of Object.keys(u.set)) out.add(`${rowKey}:${col}`);
  return out;
}

/** Wire value for main: json columns carry raw JSON text (objects stringified), everything else as-is. */
export function wireValue(value: CellValue, dataType: string): CellValue {
  if (value === null || isDefaultSentinel(value)) return value;
  if (classifyType(dataType) === 'json') return typeof value === 'string' ? value : JSON.stringify(value as JsonValue);
  return value;
}

/** Ops in a stable order: updates, inserts, deletes. Throws when a table has no PK (callers guard). */
export function toOps(b: EditBuffer, fields: FieldInfo[], pkColumns: string[]): RowOp[] {
  const typeOf = (name: string): string => fields.find((f) => f.name === name)?.dataType ?? 'text';
  const pkIndexes = pkColumns.map((c) => fields.findIndex((f) => f.name === c));
  if (pkIndexes.some((i) => i < 0)) throw new Error('primary key columns are not in the result set');
  const pkOf = (row: CellValue[]): Record<string, CellValue> => {
    const pk: Record<string, CellValue> = {};
    pkColumns.forEach((c, i) => (pk[c] = row[pkIndexes[i] as number] ?? null));
    return pk;
  };
  const ops: RowOp[] = [];
  for (const u of Object.values(b.updates)) {
    const set: Record<string, CellValue> = {};
    for (const [col, v] of Object.entries(u.set)) set[col] = wireValue(v, typeOf(col));
    ops.push({ op: 'update', pk: pkOf(u.original), set });
  }
  for (const ins of b.inserts) {
    const values: Record<string, CellValue> = {};
    for (const [col, v] of Object.entries(ins)) if (!isDefaultSentinel(v)) values[col] = wireValue(v, typeOf(col));
    ops.push({ op: 'insert', values });
  }
  for (const rowKey of b.deletes) {
    const original = b.updates[rowKey]?.original;
    if (original) ops.push({ op: 'delete', pk: pkOf(original) });
  }
  return ops;
}

/** Deletes need the original row for the PK; callers pass rows by key so deletes of untouched rows work. */
export function toOpsWithRows(b: EditBuffer, fields: FieldInfo[], pkColumns: string[], rowByKey: (key: string) => CellValue[] | undefined): RowOp[] {
  const withOriginals: EditBuffer = {
    ...b,
    updates: { ...b.updates },
    deletes: []
  };
  const ops = toOps(withOriginals, fields, pkColumns);
  const pkIndexes = pkColumns.map((c) => fields.findIndex((f) => f.name === c));
  for (const key of b.deletes) {
    const row = rowByKey(key) ?? b.updates[key]?.original;
    if (!row) continue;
    const pk: Record<string, CellValue> = {};
    pkColumns.forEach((c, i) => (pk[c] = row[pkIndexes[i] as number] ?? null));
    ops.push({ op: 'delete', pk });
  }
  return ops;
}
