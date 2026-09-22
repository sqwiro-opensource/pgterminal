import type { SqlStatement } from './types';

/**
 * TimescaleDB introspection. Every statement here must only run after
 * `hasTimescaleSql()` reported the extension as installed.
 */

/** Chunk/compression/retention facts for one hypertable (`$1` schema, `$2` name). */
export function hypertableInfoSql(schema: string, table: string): SqlStatement {
  return {
    text: `
      SELECT h.num_chunks::int AS chunks,
             h.compression_enabled AS compression_enabled,
             (SELECT count(*)::int FROM timescaledb_information.chunks c
               WHERE c.hypertable_schema = h.hypertable_schema AND c.hypertable_name = h.hypertable_name AND c.is_compressed) AS compressed_chunks,
             (SELECT j.config ->> 'drop_after' FROM timescaledb_information.jobs j
               WHERE j.proc_name = 'policy_retention' AND j.hypertable_schema = h.hypertable_schema AND j.hypertable_name = h.hypertable_name
               LIMIT 1) AS retention
      FROM timescaledb_information.hypertables h
      WHERE h.hypertable_schema = $1 AND h.hypertable_name = $2`,
    values: [schema, table]
  };
}

/** Server-wide summary for the overview card. */
export function timescaleSummarySql(): SqlStatement {
  return {
    text: `
      SELECT (SELECT count(*)::int FROM timescaledb_information.hypertables) AS hypertables,
             (SELECT count(*)::int FROM timescaledb_information.chunks) AS chunks,
             (SELECT count(*)::int FROM timescaledb_information.chunks WHERE is_compressed) AS compressed_chunks`,
    values: []
  };
}
