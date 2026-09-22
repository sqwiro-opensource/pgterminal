import format from 'pg-format';
import type { CellValue, Filter, JsonValue } from '@shared/ipc';

/** Collects `$n` parameters in order while SQL text is being built. */
export class ParamSink {
  readonly values: CellValue[] = [];

  /** Appends a value and returns its placeholder (`$n`, or `$n::cast`). */
  add(value: CellValue, cast?: string): string {
    this.values.push(value);
    const ph = `$${this.values.length}`;
    return cast ? `${ph}::${cast}` : ph;
  }
}

/** Column type names (pg_type.typname, e.g. `jsonb`, `_int8`, `numeric`) by column name. */
export type ColumnTypes = Record<string, string>;

const COMPARISON: Record<string, string> = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };

/** True for jsonb/json typnames. */
export function isJsonType(typname: string | undefined): boolean {
  return typname === 'jsonb' || typname === 'json';
}

/** True for array typnames (`_int8`) or SQL-style `int8[]`. */
export function isArrayType(typname: string | undefined): boolean {
  return !!typname && (typname.startsWith('_') || typname.endsWith('[]'));
}

/** `_int8` → `int8[]`; `int8[]` stays. Returns null for non-array names. */
export function arrayCast(typname: string | undefined): string | null {
  if (!typname) return null;
  if (typname.endsWith('[]')) return typname;
  if (typname.startsWith('_')) return `${typname.slice(1)}[]`;
  return null;
}

/**
 * Builds the body of a WHERE clause (without the keyword) from typed filters.
 * Identifiers go through pg-format `%I`; every value becomes a `$n` parameter. `raw`
 * fragments are appended verbatim inside parentheses and never receive parameters.
 * Returns '' when there are no filters.
 */
export function buildWhere(filters: Filter[], params: ParamSink, columnTypes: ColumnTypes = {}): string {
  const parts: string[] = [];
  for (const f of filters) {
    const col = format.ident(f.column);
    const type = columnTypes[f.column];
    switch (f.op) {
      case 'eq':
      case 'neq':
        if (f.value === null || f.value === undefined) {
          parts.push(`${col} IS ${f.op === 'eq' ? '' : 'NOT '}NULL`);
        } else {
          parts.push(`${col} ${COMPARISON[f.op]} ${params.add(valueFor(f.value, type))}`);
        }
        break;
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte':
        parts.push(`${col} ${COMPARISON[f.op]} ${params.add(valueFor(f.value ?? null, type))}`);
        break;
      case 'like':
        parts.push(`${col} LIKE ${params.add(String(f.value ?? ''))}`);
        break;
      case 'ilike':
        parts.push(`${col} ILIKE ${params.add(String(f.value ?? ''))}`);
        break;
      case 'in': {
        const list = Array.isArray(f.value) ? f.value : f.value === undefined ? [] : [f.value];
        if (list.length === 0) parts.push('FALSE');
        else parts.push(`${col} = ANY(${params.add(list)})`);
        break;
      }
      case 'isNull':
        parts.push(`${col} IS NULL`);
        break;
      case 'isNotNull':
        parts.push(`${col} IS NOT NULL`);
        break;
      case 'contains': {
        if (isJsonType(type)) {
          parts.push(`${col} @> ${params.add(jsonText(f.value ?? null), 'jsonb')}`);
        } else if (isArrayType(type)) {
          const arr = Array.isArray(f.value) ? f.value : [f.value ?? null];
          const cast = arrayCast(type);
          parts.push(`${col} @> ${params.add(arr, cast ?? undefined)}`);
        } else {
          parts.push(`${col} @> ${params.add(f.value ?? null)}`);
        }
        break;
      }
      case 'raw':
        if (typeof f.value === 'string' && f.value.trim() !== '') parts.push(`(${f.value})`);
        break;
      default:
        throw new Error(`Unsupported filter op: ${String((f as Filter).op)}`);
    }
  }
  return parts.join(' AND ');
}

/** JSON text for a jsonb parameter: strings are raw JSON text, everything else is stringified. */
export function jsonText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Values compared against json columns are sent as JSON text; others pass through. */
function valueFor(value: JsonValue, type: string | undefined): CellValue {
  if (isJsonType(type)) return jsonText(value);
  return value;
}
