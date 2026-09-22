import format from 'pg-format';
import type { CellValue, FetchRowsRequest, Sort } from '@shared/ipc';
import { ParamSink, buildWhere, type ColumnTypes } from './filters';

/** What the builder needs to know about the relation. */
export interface RelationMeta {
  pkColumns: string[];
  columnTypes: ColumnTypes;
}

/** A built SELECT. `reversed` means rows come back in reverse order and the caller must flip them. */
export interface BuiltSelect {
  text: string;
  values: CellValue[];
  keyset: boolean;
  reversed: boolean;
}

/** Sort to apply: the request's sort, or the primary key ascending, or ctid when there is no key. */
export function effectiveSort(sort: Sort[], pkColumns: string[]): Sort[] {
  if (sort.length > 0) return sort;
  if (pkColumns.length > 0) return pkColumns.map((column) => ({ column, dir: 'asc' as const }));
  return [{ column: 'ctid', dir: 'asc' }];
}

/** Keyset paging is possible only when the sort is exactly the primary key with one direction. */
export function isKeysetEligible(sort: Sort[], pkColumns: string[]): boolean {
  if (pkColumns.length === 0 || sort.length !== pkColumns.length) return false;
  const dir = sort[0]?.dir;
  return sort.every((s, i) => s.column === pkColumns[i] && s.dir === dir && s.nullsFirst === undefined);
}

function orderBy(sort: Sort[], reverse: boolean): string {
  return sort
    .map((s) => {
      const dir = (s.dir === 'asc') !== reverse ? 'ASC' : 'DESC';
      const nulls =
        s.nullsFirst === undefined ? '' : (s.nullsFirst !== reverse ? ' NULLS FIRST' : ' NULLS LAST');
      return `${format.ident(s.column)} ${dir}${nulls}`;
    })
    .join(', ');
}

/**
 * Builds a parameterised page query. Keyset mode compares the PK tuple against the boundary
 * row (`after` or `before`); offset mode uses ORDER BY … OFFSET. LIMIT is `limit + 1` so the
 * caller can detect `hasMore` by dropping the extra row.
 */
export function buildSelect(req: FetchRowsRequest, meta: RelationMeta): BuiltSelect {
  const params = new ParamSink();
  const sort = effectiveSort(req.sort, meta.pkColumns);
  const cols = req.columns && req.columns.length > 0 ? req.columns.map((c) => format.ident(c)).join(', ') : '*';
  const where: string[] = [];
  const filterSql = buildWhere(req.filters, params, meta.columnTypes);
  if (filterSql) where.push(filterSql);

  let keyset = false;
  let reversed = false;

  if (req.page.mode === 'keyset' && isKeysetEligible(sort, meta.pkColumns)) {
    keyset = true;
    const asc = sort[0]?.dir === 'asc';
    const boundary = req.page.before ?? req.page.after;
    const isBefore = req.page.before != null;
    if (boundary) {
      for (const pk of meta.pkColumns) {
        if (!(pk in boundary)) throw new Error(`keyset boundary is missing primary key column "${pk}"`);
      }
      const tuple = meta.pkColumns.map((c) => format.ident(c)).join(', ');
      const placeholders = meta.pkColumns.map((c) => params.add(boundary[c] ?? null)).join(', ');
      // "after" in ascending order means greater-than; "before" flips the comparison.
      const forward = asc !== isBefore;
      where.push(`(${tuple}) ${forward ? '>' : '<'} (${placeholders})`);
      reversed = isBefore;
    }
  } else if (req.page.mode === 'offset' && req.page.offset > 0) {
    // handled below after ORDER BY
  }

  let text = `SELECT ${cols} FROM ${format.ident(req.schema)}.${format.ident(req.table)}`;
  if (where.length > 0) text += ` WHERE ${where.join(' AND ')}`;
  text += ` ORDER BY ${orderBy(sort, reversed)}`;
  text += ` LIMIT ${params.add(req.limit + 1)}`;
  if (!keyset && req.page.mode === 'offset' && req.page.offset > 0) {
    text += ` OFFSET ${params.add(req.page.offset)}`;
  }
  return { text, values: params.values, keyset, reversed };
}

/** Builds `SELECT count(*)::text FROM schema.table [WHERE …]`. */
export function buildCount(
  schema: string,
  table: string,
  filters: FetchRowsRequest['filters'],
  columnTypes: ColumnTypes
): { text: string; values: CellValue[] } {
  const params = new ParamSink();
  const where = buildWhere(filters, params, columnTypes);
  const text = `SELECT count(*)::text AS n FROM ${format.ident(schema)}.${format.ident(table)}${where ? ` WHERE ${where}` : ''}`;
  return { text, values: params.values };
}
