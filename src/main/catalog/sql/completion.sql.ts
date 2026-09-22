import type { SqlStatement } from './types';

/**
 * One query over pg_class ⨝ pg_namespace ⨝ pg_attribute for the whole database:
 * every relation with its columns (name, type, isPk). `$1` = show internal schemas.
 */
export function completionIndexSql(showInternal: boolean): SqlStatement {
  return {
    text: `
      SELECT n.nspname AS schema,
             c.relname AS name,
             c.relkind::text AS relkind,
             COALESCE(cols.columns, '[]'::jsonb) AS columns
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
                 'name', a.attname,
                 'type', format_type(a.atttypid, a.atttypmod),
                 'isPk', COALESCE(a.attnum = ANY (pk.conkey), false)) ORDER BY a.attnum) AS columns
        FROM pg_attribute a
        LEFT JOIN pg_constraint pk ON pk.conrelid = c.oid AND pk.contype = 'p'
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ) cols ON true
      WHERE c.relkind IN ('r','p','v','m','f')
        AND NOT c.relispartition
        AND n.nspname <> 'pg_toast'
        AND n.nspname NOT LIKE 'pg_temp_%'
        AND n.nspname NOT LIKE 'pg_toast_temp_%'
        AND ($1::boolean OR (
              n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname NOT LIKE '\\_timescaledb\\_%'
              AND n.nspname <> 'timescaledb_information'
              AND n.nspname <> 'timescaledb_experimental'))
      ORDER BY n.nspname, c.relname`,
    values: [showInternal]
  };
}
