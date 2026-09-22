import format from 'pg-format';
import { isDefaultSentinel, type CellValue } from '@shared/ipc';
import { ParamSink, arrayCast, isArrayType, isJsonType, jsonText, type ColumnTypes } from './filters';

/** A built statement. */
export interface BuiltStatement {
  text: string;
  values: CellValue[];
}

/**
 * Placeholder for one column value: DEFAULT for the sentinel (no parameter), `$n::jsonb` for
 * json columns (strings are raw JSON text, objects are stringified), `$n::type[]` for arrays,
 * plain `$n` otherwise. `null` is always SQL NULL.
 */
function valuePlaceholder(column: string, value: CellValue, params: ParamSink, types: ColumnTypes): string {
  if (isDefaultSentinel(value)) return 'DEFAULT';
  const type = types[column];
  if (value === null) return params.add(null);
  if (isJsonType(type)) return params.add(jsonText(value), type);
  if (isArrayType(type)) return params.add(value, arrayCast(type) ?? undefined);
  return params.add(value);
}

/** `INSERT INTO schema.table (cols) VALUES ($1, …) RETURNING *` (or DEFAULT VALUES when empty). */
export function buildInsert(
  schema: string,
  table: string,
  values: Record<string, CellValue>,
  types: ColumnTypes = {}
): BuiltStatement {
  const params = new ParamSink();
  const target = `${format.ident(schema)}.${format.ident(table)}`;
  const columns = Object.keys(values);
  if (columns.length === 0) return { text: `INSERT INTO ${target} DEFAULT VALUES RETURNING *`, values: [] };
  const cols = columns.map((c) => format.ident(c)).join(', ');
  const vals = columns.map((c) => valuePlaceholder(c, values[c] as CellValue, params, types)).join(', ');
  return { text: `INSERT INTO ${target} (${cols}) VALUES (${vals}) RETURNING *`, values: params.values };
}

function pkWhere(pk: Record<string, CellValue>, params: ParamSink): string {
  const keys = Object.keys(pk);
  if (keys.length === 0) throw new Error('Mutation requires the full primary key; none given');
  return keys
    .map((k) => {
      const v = pk[k];
      if (v === null || v === undefined || isDefaultSentinel(v)) {
        throw new Error(`Primary key column "${k}" has no value`);
      }
      return `${format.ident(k)} = ${params.add(v)}`;
    })
    .join(' AND ');
}

/** `UPDATE schema.table SET col = $n … WHERE pk = $n … RETURNING *`. Never WHERE-less. */
export function buildUpdate(
  schema: string,
  table: string,
  pk: Record<string, CellValue>,
  set: Record<string, CellValue>,
  types: ColumnTypes = {}
): BuiltStatement {
  const params = new ParamSink();
  const columns = Object.keys(set);
  if (columns.length === 0) throw new Error('Update has no columns to set');
  const assignments = columns
    .map((c) => `${format.ident(c)} = ${valuePlaceholder(c, set[c] as CellValue, params, types)}`)
    .join(', ');
  const where = pkWhere(pk, params);
  return {
    text: `UPDATE ${format.ident(schema)}.${format.ident(table)} SET ${assignments} WHERE ${where} RETURNING *`,
    values: params.values
  };
}

/** `DELETE FROM schema.table WHERE pk = $n … RETURNING *`. Never WHERE-less. */
export function buildDelete(schema: string, table: string, pk: Record<string, CellValue>): BuiltStatement {
  const params = new ParamSink();
  const where = pkWhere(pk, params);
  return {
    text: `DELETE FROM ${format.ident(schema)}.${format.ident(table)} WHERE ${where} RETURNING *`,
    values: params.values
  };
}
