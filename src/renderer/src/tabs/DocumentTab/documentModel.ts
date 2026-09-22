/** Pure helpers for the document tab (DOM-free, unit-tested). */
import type { DocTarget } from '@shared/types/doclink';
import type { CellValue, FieldInfo, JsonValue } from '@shared/types/query';
import type { RowOp } from '@shared/types/rows';
import { classifyType } from '@renderer/lib/format';

export type Row = Record<string, CellValue>;

const NAME_LIKE = ['name', 'title', 'label', 'email', 'code', 'slug'];

/** PK/_id first, then name-like columns, then table order; capped. */
export function orderFieldsForPreview(fields: FieldInfo[], pkColumns: string[] = [], max = 8): FieldInfo[] {
  const pk = fields.filter((f) => pkColumns.includes(f.name) || f.name === '_id');
  const named = fields.filter((f) => !pk.includes(f) && NAME_LIKE.includes(f.name.toLowerCase()));
  const rest = fields.filter((f) => !pk.includes(f) && !named.includes(f));
  return [...pk, ...named, ...rest].slice(0, max);
}

/** Row array → object keyed by column name. */
export function rowToObject(fields: FieldInfo[], row: CellValue[]): Row {
  const out: Row = {};
  fields.forEach((f, i) => {
    out[f.name] = row[i] ?? null;
  });
  return out;
}

export function cellsEqual(a: CellValue, b: CellValue): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

export interface RowDiff {
  column: string;
  from: CellValue;
  to: CellValue;
}

/** Columns whose draft value differs from the loaded row (only columns present in `fields`). */
export function diffRow(original: Row, draft: Row, fields: FieldInfo[]): RowDiff[] {
  const out: RowDiff[] = [];
  for (const f of fields) {
    const from = original[f.name] ?? null;
    const to = draft[f.name] ?? null;
    if (!cellsEqual(from, to)) out.push({ column: f.name, from, to });
  }
  return out;
}

/** Values for `rows:mutate` — jsonb/json as raw JSON text, everything else as-is (NULL stays null). */
export function toMutationSet(diff: RowDiff[], fields: FieldInfo[]): Record<string, CellValue> {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const set: Record<string, CellValue> = {};
  for (const d of diff) {
    const f = byName.get(d.column);
    const kind = f ? classifyType(f.dataType) : 'text';
    if (d.to !== null && kind === 'json' && typeof d.to !== 'string') set[d.column] = JSON.stringify(d.to);
    else if (d.to !== null && kind === 'json' && typeof d.to === 'string') set[d.column] = JSON.stringify(d.to);
    else set[d.column] = d.to ?? null;
  }
  return set;
}

/** Build the update op for a draft; returns null when nothing changed. */
export function buildUpdateOp(original: Row, draft: Row, fields: FieldInfo[], pk: Record<string, CellValue>): RowOp | null {
  const diff = diffRow(original, draft, fields).filter((d) => !(d.column in pk));
  if (diff.length === 0) return null;
  return { op: 'update', pk, set: toMutationSet(diff, fields) };
}

/** Human preview of the statement `rows:mutate` will run. */
export function updatePreviewSql(schema: string, table: string, set: Record<string, CellValue>, pk: Record<string, CellValue>): string {
  const q = (s: string): string => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
  let n = 0;
  const sets = Object.keys(set).map((c) => `${q(c)} = $${++n}`);
  const where = Object.keys(pk).map((c) => `${q(c)} = $${++n}`);
  return `UPDATE ${q(schema)}.${q(table)}\n   SET ${sets.join(',\n       ')}\n WHERE ${where.join(' AND ')}\nRETURNING *;`;
}

export function deletePreviewSql(schema: string, table: string, pk: Record<string, CellValue>): string {
  const q = (s: string): string => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
  let n = 0;
  const where = Object.keys(pk).map((c) => `${q(c)} = $${++n}`);
  return `DELETE FROM ${q(schema)}.${q(table)} WHERE ${where.join(' AND ')};`;
}

/** Breadcrumb segments for the header. */
export function breadcrumb(server: string, database: string, target: DocTarget): string[] {
  return [server, database, `${target.schema}.${target.table}`, target.keyValue];
}

/** Draft as pretty JSON for the editor view. */
export function draftToJsonText(draft: Row, fields: FieldInfo[]): string {
  const ordered: Record<string, CellValue> = {};
  for (const f of fields) ordered[f.name] = draft[f.name] ?? null;
  return JSON.stringify(ordered, null, 2);
}

/** Parse the editor text back into a draft. Unknown keys are dropped; `_id` is forced back to the original. */
export function parseDraft(text: string, fields: FieldInfo[], original: Row): { draft: Row } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'Document must be a JSON object' };
  const obj = parsed as Record<string, JsonValue>;
  const draft: Row = {};
  for (const f of fields) {
    const v = obj[f.name];
    draft[f.name] = v === undefined ? (original[f.name] ?? null) : v;
  }
  if ('_id' in original) draft._id = original._id ?? null;
  return { draft };
}

/** Set a nested value inside a column's JSON by JSON-pointer-like path segments (`['meta','owner']`). */
export function setPath(value: JsonValue, path: string[], next: JsonValue): JsonValue {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (head === undefined) return next;
  if (Array.isArray(value)) {
    const copy = value.slice();
    const i = Number(head);
    copy[i] = setPath(copy[i] ?? null, rest, next);
    return copy;
  }
  const obj = value && typeof value === 'object' ? { ...(value as { [k: string]: JsonValue }) } : {};
  obj[head] = setPath(obj[head] ?? null, rest, next);
  return obj;
}

/** Coerce typed text from an inline editor into a cell value for the column type. */
export function coerceInput(text: string, dataType: string, wasNull: boolean): CellValue {
  const kind = classifyType(dataType);
  if (text === '' && wasNull) return null;
  if (kind === 'bool') return text.trim().toLowerCase() === 'true' || text === 't' || text === '1';
  if (kind === 'json') {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return text;
    }
  }
  return text;
}
