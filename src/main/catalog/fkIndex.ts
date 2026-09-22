import type { Queryable } from './Queryable';

/** One foreign-key constraint as seen from the referencing table. */
export interface FkEntry {
  constraint: string;
  schema: string;
  table: string;
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
}

const cache = new WeakMap<object, FkEntry[]>();

const FK_SQL = `
SELECT c.conname AS constraint,
       ns.nspname AS schema,
       cl.relname AS "table",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)::text[] AS columns,
       rns.nspname AS "refSchema",
       rcl.relname AS "refTable",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum)::text[] AS "refColumns"
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  JOIN pg_class rcl ON rcl.oid = c.confrelid
  JOIN pg_namespace rns ON rns.oid = rcl.relnamespace
 WHERE c.contype = 'f'
   AND ns.nspname NOT LIKE 'pg\\_%' AND ns.nspname <> 'information_schema'
 ORDER BY ns.nspname, cl.relname, c.conname`;

/** Every FK constraint in the database, cached per pool object. One pg_constraint query. */
export async function getFkIndex(pool: Queryable, opts: { refresh?: boolean } = {}): Promise<FkEntry[]> {
  const key = pool as unknown as object;
  if (!opts.refresh) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const r = await pool.query<FkEntry>(FK_SQL);
  const rows = r.rows.map((x) => ({
    constraint: x.constraint,
    schema: x.schema,
    table: x.table,
    columns: x.columns ?? [],
    refSchema: x.refSchema,
    refTable: x.refTable,
    refColumns: x.refColumns ?? []
  }));
  cache.set(key, rows);
  return rows;
}

/** FKs whose referenced table is `schema.table`. */
export function fksReferencing(index: readonly FkEntry[], schema: string, table: string): FkEntry[] {
  return index.filter((f) => f.refSchema === schema && f.refTable === table);
}

/** Drop the cached index for a pool (call after DDL). */
export function invalidateFkIndex(pool: Queryable): void {
  cache.delete(pool as unknown as object);
}
