import format from 'pg-format';
import type { Pool, PoolClient } from 'pg';
import type {
  CellValue,
  CountRequest,
  CountResult,
  FetchRowsRequest,
  FieldInfo,
  MutateRowsRequest,
  MutateRowsResult,
  RowsPage
} from '@shared/ipc';
import { toPgErrorInfo } from '@main/db/pgError';
import { createTypeParsers } from '@main/db/typeParsers';
import { resolveFieldInfos } from '@main/db/typeNames';
import type { ColumnTypes } from './filters';
import { buildCount, buildSelect, type RelationMeta } from './selectBuilder';
import { buildDelete, buildInsert, buildUpdate, type BuiltStatement } from './mutationBuilder';

/** Small TTL cache of relation metadata so paging does not re-query pg_attribute every time. */
const META_TTL_MS = 30_000;
const metaCache = new WeakMap<Pool, Map<string, { meta: RelationMeta; at: number }>>();

const META_SQL = `
SELECT a.attname AS name, t.typname AS type, COALESCE(i.indisprimary, false) AS pk
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)
WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum`;

/** Column types (typname) and primary key columns of a relation, cached 30 s per pool. */
export async function relationMeta(pool: Pool, schema: string, table: string, refresh = false): Promise<RelationMeta> {
  const key = `${schema}.${table}`;
  let bucket = metaCache.get(pool);
  if (!bucket) {
    bucket = new Map();
    metaCache.set(pool, bucket);
  }
  const hit = bucket.get(key);
  if (hit && !refresh && Date.now() - hit.at < META_TTL_MS) return hit.meta;
  const r = await pool.query<{ name: string; type: string; pk: boolean }>(META_SQL, [schema, table]);
  if (r.rows.length === 0) throw new Error(`Relation ${schema}.${table} not found`);
  const columnTypes: ColumnTypes = {};
  const pkColumns: string[] = [];
  for (const row of r.rows) {
    columnTypes[row.name] = row.type;
    if (row.pk) pkColumns.push(row.name);
  }
  const meta = { pkColumns, columnTypes };
  bucket.set(key, { meta, at: Date.now() });
  return meta;
}

const types = createTypeParsers();

/** rows:fetch implementation. */
export async function fetchRows(pool: Pool, req: FetchRowsRequest): Promise<RowsPage> {
  const meta = await relationMeta(pool, req.schema, req.table);
  const built = buildSelect(req, meta);
  const started = performance.now();
  const result = await pool.query({ text: built.text, values: built.values, rowMode: 'array', types });
  const durationMs = Math.round(performance.now() - started);
  let rows = result.rows as unknown as CellValue[][];
  const hasMore = rows.length > req.limit;
  if (hasMore) rows = rows.slice(0, req.limit);
  if (built.reversed) rows = [...rows].reverse();
  const fields = await resolveFieldInfos(pool, result.fields);
  return { fields, rows, pkColumns: meta.pkColumns, hasMore, sqlText: built.text, durationMs };
}

const ESTIMATE_SQL = `
SELECT GREATEST(c.reltuples, 0)::bigint::text AS n
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relname = $2`;

/** rows:count implementation: planner estimate always, exact count(*) on request. */
export async function countRows(pool: Pool, req: CountRequest): Promise<CountResult> {
  const est = await pool.query<{ n: string }>(ESTIMATE_SQL, [req.schema, req.table]);
  const estimate = est.rows[0]?.n ?? '0';
  let exact: string | null = null;
  if (req.exact) {
    const meta = await relationMeta(pool, req.schema, req.table);
    const q = buildCount(req.schema, req.table, req.filters, meta.columnTypes);
    const r = await pool.query<{ n: string }>({ text: q.text, values: q.values });
    exact = r.rows[0]?.n ?? '0';
  }
  return { estimate, exact };
}

function buildOp(req: MutateRowsRequest, op: MutateRowsRequest['ops'][number], meta: RelationMeta): BuiltStatement {
  switch (op.op) {
    case 'insert':
      return buildInsert(req.schema, req.table, op.values, meta.columnTypes);
    case 'update':
      return buildUpdate(req.schema, req.table, op.pk, op.set, meta.columnTypes);
    case 'delete':
      return buildDelete(req.schema, req.table, op.pk);
  }
}

/** Renders a statement with its parameters as a comment, for display only. */
function displaySql(stmts: BuiltStatement[]): string {
  return stmts
    .map((s) => (s.values.length > 0 ? `${s.text};\n-- params: ${JSON.stringify(s.values)}` : `${s.text};`))
    .join('\n');
}

/**
 * rows:mutate implementation: every op in one transaction on a dedicated client, RETURNING *,
 * all-or-nothing. A failure reports the op index and rolls everything back.
 */
export async function mutateRows(pool: Pool, req: MutateRowsRequest): Promise<MutateRowsResult> {
  const meta = await relationMeta(pool, req.schema, req.table, true);
  let stmts: BuiltStatement[];
  try {
    stmts = req.ops.map((op) => buildOp(req, op, meta));
  } catch (err) {
    return { ok: false, sqlText: '', error: { ...toPgErrorInfo(err), opIndex: 0 } };
  }
  const sqlText = displaySql(stmts);
  if (req.dryRun) return { ok: true, sqlText, results: [] };
  if (stmts.length === 0) return { ok: true, sqlText, results: [] };

  let client: PoolClient | null = null;
  const results: NonNullable<MutateRowsResult['results']> = [];
  let index = 0;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    for (index = 0; index < stmts.length; index++) {
      const s = stmts[index] as BuiltStatement;
      const r = await client.query({ text: s.text, values: s.values, rowMode: 'array', types });
      const fields: FieldInfo[] = await resolveFieldInfos(pool, r.fields);
      results.push({ rowCount: r.rowCount ?? 0, returning: r.rows as unknown as CellValue[][], fields });
    }
    await client.query('COMMIT');
    return { ok: true, sqlText, results };
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    const stmt = stmts[index];
    return { ok: false, sqlText, error: { ...toPgErrorInfo(err, stmt?.text), opIndex: index } };
  } finally {
    client?.release();
  }
}

/** Quoted `schema.table` for messages. */
export function qualifiedName(schema: string, table: string): string {
  return `${format.ident(schema)}.${format.ident(table)}`;
}
