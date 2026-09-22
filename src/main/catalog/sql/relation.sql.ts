import type { SqlStatement } from './types';

/** The relation row itself for `$1`.`$2`. */
export function relationSql(schema: string, name: string): SqlStatement {
  return {
    text: `
      SELECT c.oid::text AS oid,
             c.relname AS name,
             c.relkind::text AS relkind,
             CASE WHEN c.reltuples < 0 THEN '0' ELSE c.reltuples::bigint::text END AS estimated_rows,
             CASE WHEN has_table_privilege(c.oid, 'SELECT') AND c.relkind IN ('r','p','m')
                  THEN pg_total_relation_size(c.oid)::text ELSE NULL END AS size_bytes,
             obj_description(c.oid, 'pg_class') AS comment,
             CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) ELSE NULL END AS view_definition
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p','v','m','f')`,
    values: [schema, name]
  };
}

/** Columns of `$1`.`$2` in attnum order. */
export function columnsSql(schema: string, name: string): SqlStatement {
  return {
    text: `
      SELECT a.attname AS name,
             a.attnum AS ordinal,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             NOT a.attnotnull AS nullable,
             pg_get_expr(d.adbin, d.adrelid) AS "default",
             a.attgenerated::text AS generated,
             a.attidentity::text AS identity,
             col_description(c.oid, a.attnum) AS comment,
             EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p' AND a.attnum = ANY (k.conkey)) AS is_pk,
             EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attnum = ANY (k.conkey)) AS is_fk,
             EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'u' AND a.attnum = ANY (k.conkey)) AS is_unique
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    values: [schema, name]
  };
}

/** Constraints of `$1`.`$2`. Column arrays are resolved to names. */
export function constraintsSql(schema: string, name: string): SqlStatement {
  return {
    text: `
      SELECT k.conname AS name,
             k.contype::text AS type,
             pg_get_constraintdef(k.oid, true) AS definition,
             COALESCE((SELECT jsonb_agg(a.attname ORDER BY ord)
                       FROM unnest(k.conkey) WITH ORDINALITY u(attnum, ord)
                       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.attnum), '[]'::jsonb) AS columns,
             rn.nspname AS ref_schema,
             rc.relname AS ref_table,
             CASE WHEN k.contype = 'f' THEN
               (SELECT jsonb_agg(a.attname ORDER BY ord)
                FROM unnest(k.confkey) WITH ORDINALITY u(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.attnum) END AS ref_columns,
             CASE k.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                                WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
             CASE k.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                                WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_class rc ON rc.oid = k.confrelid
      LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND k.contype IN ('p','f','u','c','x')
      ORDER BY (k.contype = 'p') DESC, k.conname`,
    values: [schema, name]
  };
}

/** Indexes of `$1`.`$2`. */
export function indexesSql(schema: string, name: string): SqlStatement {
  return {
    text: `
      SELECT ic.relname AS name,
             pg_get_indexdef(i.indexrelid) AS definition,
             i.indisunique AS is_unique,
             i.indisprimary AS is_primary,
             am.amname AS method,
             COALESCE((SELECT jsonb_agg(COALESCE(a.attname, pg_get_indexdef(i.indexrelid, ord::int, true)) ORDER BY ord)
                       FROM unnest(i.indkey) WITH ORDINALITY u(attnum, ord)
                       LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = u.attnum AND u.attnum > 0), '[]'::jsonb) AS columns,
             pg_relation_size(i.indexrelid)::text AS size_bytes
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_am am ON am.oid = ic.relam
      WHERE n.nspname = $1 AND c.relname = $2
      ORDER BY i.indisprimary DESC, ic.relname`,
    values: [schema, name]
  };
}

/** User triggers of `$1`.`$2` (internal FK triggers excluded). */
export function triggersSql(schema: string, name: string): SqlStatement {
  return {
    text: `
      SELECT t.tgname AS name,
             pg_get_triggerdef(t.oid, true) AS definition,
             t.tgtype::int AS tgtype,
             t.tgenabled <> 'D' AS enabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND NOT t.tgisinternal
      ORDER BY t.tgname`,
    values: [schema, name]
  };
}

/** Decode pg_trigger.tgtype bits into timing and events. */
export function decodeTriggerType(tgtype: number): { timing: string; events: string[] } {
  const BEFORE = 2, INSERT = 4, DELETE = 8, UPDATE = 16, TRUNCATE = 32, INSTEAD = 64;
  const timing = tgtype & BEFORE ? 'BEFORE' : tgtype & INSTEAD ? 'INSTEAD OF' : 'AFTER';
  const events: string[] = [];
  if (tgtype & INSERT) events.push('INSERT');
  if (tgtype & DELETE) events.push('DELETE');
  if (tgtype & UPDATE) events.push('UPDATE');
  if (tgtype & TRUNCATE) events.push('TRUNCATE');
  return { timing, events };
}
