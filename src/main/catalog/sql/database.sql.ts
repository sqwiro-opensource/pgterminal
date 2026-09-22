import type { SqlStatement } from './types';

/** Schemas of the current database. `$1` = show internal schemas (pg_catalog, information_schema, _timescaledb_*). */
export function schemasSql(showInternal: boolean): SqlStatement {
  return {
    text: `
      SELECT n.nspname AS name,
             pg_get_userbyid(n.nspowner) AS owner,
             obj_description(n.oid, 'pg_namespace') AS comment
      FROM pg_namespace n
      WHERE n.nspname <> 'pg_toast'
        AND n.nspname NOT LIKE 'pg_temp_%'
        AND n.nspname NOT LIKE 'pg_toast_temp_%'
        AND ($1::boolean OR (
              n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname NOT LIKE '\\_timescaledb\\_%'
              AND n.nspname <> 'timescaledb_information'
              AND n.nspname <> 'timescaledb_experimental'))
      ORDER BY (n.nspname = 'public') DESC, n.nspname`,
    values: [showInternal]
  };
}

/** Installed extensions. */
export function extensionsSql(): SqlStatement {
  return {
    text: `
      SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname`,
    values: []
  };
}

/** Server facts + search_path + current user, in one row. */
export function serverInfoSql(): SqlStatement {
  return {
    text: `
      SELECT version() AS version,
             current_setting('server_version_num')::int AS version_num,
             current_setting('server_encoding') AS server_encoding,
             COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS is_superuser,
             current_setting('search_path') AS search_path,
             current_user AS current_user`,
    values: []
  };
}

/** Expand `$user` and split a search_path setting into schema names. */
export function parseSearchPath(setting: string, currentUser: string): string[] {
  return setting
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s))
    .map((s) => (s === '$user' ? currentUser : s));
}
