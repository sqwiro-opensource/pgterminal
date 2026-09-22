import type { SqlStatement } from './types';

/** Relations (r, p, v, m, f) of schema `$1`, with estimates, sizes and comments. */
export function relationsSql(schema: string): SqlStatement {
  return {
    text: `
      SELECT c.relname AS name,
             c.relkind::text AS relkind,
             CASE WHEN c.reltuples < 0 THEN '0' ELSE c.reltuples::bigint::text END AS estimated_rows,
             CASE WHEN has_table_privilege(c.oid, 'SELECT') AND c.relkind IN ('r','p','m')
                  THEN pg_total_relation_size(c.oid)::text ELSE NULL END AS size_bytes,
             obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r','p','v','m','f')
        AND NOT c.relispartition
      ORDER BY c.relname`,
    values: [schema]
  };
}

/** Hypertables of schema `$1` (only run when the timescaledb extension is installed). */
export function hypertablesSql(schema: string): SqlStatement {
  return {
    text: `SELECT hypertable_name AS name FROM timescaledb_information.hypertables WHERE hypertable_schema = $1`,
    values: [schema]
  };
}

/** True when timescaledb is installed. */
export function hasTimescaleSql(): SqlStatement {
  return { text: `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS installed`, values: [] };
}

/** Functions and procedures of schema `$1`. */
export function routinesSql(schema: string): SqlStatement {
  return {
    text: `
      SELECT p.proname AS name,
             p.prokind::text AS prokind,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_identity_arguments(p.oid) AS identity_args,
             CASE WHEN p.prokind = 'p' THEN '' ELSE pg_get_function_result(p.oid) END AS returns,
             l.lanname AS language
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1 AND p.prokind IN ('f','p')
      ORDER BY p.proname, identity_args`,
    values: [schema]
  };
}

/** Sequences of schema `$1`. */
export function sequencesSql(schema: string): SqlStatement {
  return {
    text: `
      SELECT c.relname AS name,
             s.seqstart::text AS start_value,
             s.seqincrement::text AS increment,
             s.seqcycle AS cycle,
             format_type(s.seqtypid, NULL) AS data_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_sequence s ON s.seqrelid = c.oid
      WHERE n.nspname = $1 AND c.relkind = 'S'
      ORDER BY c.relname`,
    values: [schema]
  };
}

/** Enum, composite and domain types of schema `$1`. */
export function typesSql(schema: string): SqlStatement {
  return {
    text: `
      SELECT t.typname AS name,
             CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'c' THEN 'composite' WHEN 'd' THEN 'domain' ELSE t.typtype::text END AS category,
             CASE WHEN t.typtype = 'e'
                  THEN (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
                  ELSE NULL END AS labels,
             CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) ELSE NULL END AS base_type
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      LEFT JOIN pg_class c ON c.oid = t.typrelid
      WHERE n.nspname = $1
        AND t.typtype IN ('e','c','d')
        AND (t.typtype <> 'c' OR c.relkind = 'c')
        AND NOT EXISTS (SELECT 1 FROM pg_type el WHERE el.oid = t.typelem AND el.typarray = t.oid)
      ORDER BY t.typname`,
    values: [schema]
  };
}
