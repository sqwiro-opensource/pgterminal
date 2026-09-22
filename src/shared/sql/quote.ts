/**
 * Identifier / literal quoting for SQL text shown to the user (Generate SQL, copy-as, confirm dialogs).
 * Server-side statements built in main use pg-format; this pure module mirrors its rules without deps.
 */

/** Words that must be quoted even when lower-case (PostgreSQL reserved keywords, common subset). */
const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 'authorization', 'binary', 'both',
  'case', 'cast', 'check', 'collate', 'collation', 'column', 'concurrently', 'constraint', 'create', 'cross',
  'current_catalog', 'current_date', 'current_role', 'current_schema', 'current_time', 'current_timestamp',
  'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch',
  'for', 'foreign', 'freeze', 'from', 'full', 'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner',
  'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
  'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order', 'outer', 'overlaps',
  'placing', 'primary', 'references', 'returning', 'right', 'select', 'session_user', 'similar', 'some', 'symmetric',
  'table', 'tablesample', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose',
  'when', 'where', 'window', 'with'
]);

const SAFE = /^[a-z_][a-z0-9_]*$/;

/** Quote an identifier only when needed (`a"b` → `"a""b"`, `Select` → `"Select"`, `simple` → `simple`). */
export function quoteIdent(name: string): string {
  if (SAFE.test(name) && !RESERVED.has(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

/** `schema.name`, each part quoted as needed. */
export function qualify(schema: string | undefined | null, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}

/** Quote a text literal (`it's` → `'it''s'`); null → NULL. */
export function quoteLiteral(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}
