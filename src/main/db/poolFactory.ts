import { Pool, type PoolConfig } from 'pg';
import type { ConnectionMeta, ServerInfo } from '@shared/ipc';
import { createTypeParsers } from './typeParsers';

/** Every pgui backend is tagged with this application_name (used by disconnect checks and tests). */
export const APPLICATION_NAME = 'pgui';

/** Translate ConnectionMeta into a pg PoolConfig. Password is injected separately by the registry. */
export function buildPoolConfig(meta: ConnectionMeta, database: string, password: string | undefined): PoolConfig {
  const opts: string[] = [];
  if (meta.statementTimeoutMs > 0) opts.push(`-c statement_timeout=${Math.floor(meta.statementTimeoutMs)}`);
  if (meta.readOnly) opts.push('-c default_transaction_read_only=on');
  const ssl: PoolConfig['ssl'] =
    meta.sslMode === 'disable' ? false : meta.sslMode === 'require' ? { rejectUnauthorized: false } : true;
  const config: PoolConfig = {
    host: meta.host,
    port: meta.port,
    user: meta.user,
    database,
    max: meta.poolMax || 4,
    idleTimeoutMillis: meta.idleTimeoutMs || 30000,
    connectionTimeoutMillis: meta.connectTimeoutMs || 5000,
    application_name: APPLICATION_NAME,
    keepAlive: true,
    types: createTypeParsers(),
    ssl
  };
  if (password !== undefined) config.password = password;
  if (opts.length) config.options = opts.join(' ');
  return config;
}

/** Create a Pool for one (connection, database). Does not connect until first use. */
export function createPool(meta: ConnectionMeta, database: string, password: string | undefined): Pool {
  return new Pool(buildPoolConfig(meta, database, password));
}

const PROBE_SQL = `SELECT version() AS version,
  current_setting('server_version_num')::int AS version_num,
  current_setting('server_encoding') AS server_encoding,
  current_setting('is_superuser')::bool AS is_superuser,
  current_setting('search_path') AS search_path,
  current_user AS current_user,
  (SELECT coalesce(array_agg(extname::text ORDER BY extname), '{}'::text[]) FROM pg_extension) AS extensions`;

/** Split a search_path setting into schema names, expanding "$user". */
export function parseSearchPath(raw: string, user: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s))
    .map((s) => (s === '$user' ? user : s));
}

/** One round trip that learns server facts and the effective search_path. */
export async function probeConnection(pool: Pool): Promise<ServerInfo & { searchPath: string[] }> {
  const res = await pool.query<{
    version: string;
    version_num: number;
    server_encoding: string;
    is_superuser: boolean;
    search_path: string;
    current_user: string;
    extensions: string[];
  }>(PROBE_SQL);
  const row = res.rows[0];
  if (!row) throw new Error('probe returned no row');
  return {
    version: row.version,
    versionNum: Number(row.version_num),
    serverEncoding: row.server_encoding,
    isSuperuser: !!row.is_superuser,
    extensions: Array.isArray(row.extensions) ? row.extensions : [],
    searchPath: parseSearchPath(row.search_path, row.current_user)
  };
}
