/**
 * Pure SQL text generators used by tree actions (Generate SQL ▸, destructive confirmations).
 * Everything here is text for the user to read/run; nothing is executed from these strings directly.
 */
import type { ColumnInfo } from '@shared/types/catalog';
import { qualify, quoteIdent } from '@shared/sql/quote';

export interface RelRef {
  schema: string;
  name: string;
}

const insertable = (c: ColumnInfo): boolean => c.generated === null && c.identity !== 'always';

export function selectSql(rel: RelRef, columns: ColumnInfo[], limit = 100): string {
  const cols = columns.length ? columns.map((c) => quoteIdent(c.name)).join(', ') : '*';
  return `SELECT ${cols}\nFROM ${qualify(rel.schema, rel.name)}\nLIMIT ${limit};`;
}

export function insertSql(rel: RelRef, columns: ColumnInfo[]): string {
  const cols = columns.filter(insertable);
  const names = cols.map((c) => quoteIdent(c.name)).join(', ');
  const params = cols.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO ${qualify(rel.schema, rel.name)} (${names})\nVALUES (${params})\nRETURNING *;`;
}

export function updateSql(rel: RelRef, columns: ColumnInfo[]): string {
  const pk = columns.filter((c) => c.isPk);
  const sets = columns.filter((c) => !c.isPk && insertable(c));
  const assignments = sets.map((c, i) => `${quoteIdent(c.name)} = $${i + 1}`).join(',\n    ');
  const where = pk.length
    ? pk.map((c, i) => `${quoteIdent(c.name)} = $${sets.length + i + 1}`).join(' AND ')
    : '/* no primary key — add a WHERE clause */ false';
  return `UPDATE ${qualify(rel.schema, rel.name)}\nSET ${assignments}\nWHERE ${where}\nRETURNING *;`;
}

export function deleteSql(rel: RelRef, columns: ColumnInfo[]): string {
  const pk = columns.filter((c) => c.isPk);
  const where = pk.length
    ? pk.map((c, i) => `${quoteIdent(c.name)} = $${i + 1}`).join(' AND ')
    : '/* no primary key — add a WHERE clause */ false';
  return `DELETE FROM ${qualify(rel.schema, rel.name)}\nWHERE ${where};`;
}

export type DropKind =
  | 'table'
  | 'view'
  | 'matview'
  | 'foreignTable'
  | 'partitionedTable'
  | 'function'
  | 'procedure'
  | 'sequence'
  | 'type'
  | 'schema'
  | 'database'
  | 'extension'
  | 'index';

const DROP_WORD: Record<DropKind, string> = {
  table: 'TABLE',
  partitionedTable: 'TABLE',
  foreignTable: 'FOREIGN TABLE',
  view: 'VIEW',
  matview: 'MATERIALIZED VIEW',
  function: 'FUNCTION',
  procedure: 'PROCEDURE',
  sequence: 'SEQUENCE',
  type: 'TYPE',
  schema: 'SCHEMA',
  database: 'DATABASE',
  extension: 'EXTENSION',
  index: 'INDEX'
};

export interface DropOptions {
  ifExists?: boolean;
  cascade?: boolean;
}

export function dropSql(kind: DropKind, target: string, opts: DropOptions = {}): string {
  return `DROP ${DROP_WORD[kind]}${opts.ifExists ? ' IF EXISTS' : ''} ${target}${opts.cascade ? ' CASCADE' : ''};`;
}

export function truncateSql(rel: RelRef, opts: { restartIdentity?: boolean; cascade?: boolean } = {}): string {
  return `TRUNCATE TABLE ${qualify(rel.schema, rel.name)}${opts.restartIdentity ? ' RESTART IDENTITY' : ''}${opts.cascade ? ' CASCADE' : ''};`;
}

export function renameSql(kind: 'table' | 'view' | 'matview' | 'schema', target: string, newName: string): string {
  const word = kind === 'matview' ? 'MATERIALIZED VIEW' : kind.toUpperCase();
  return `ALTER ${word} ${target} RENAME TO ${quoteIdent(newName)};`;
}

export function dropColumnSql(rel: RelRef, column: string, cascade = false): string {
  return `ALTER TABLE ${qualify(rel.schema, rel.name)} DROP COLUMN ${quoteIdent(column)}${cascade ? ' CASCADE' : ''};`;
}

export function dropConstraintSql(rel: RelRef, constraint: string, cascade = false): string {
  return `ALTER TABLE ${qualify(rel.schema, rel.name)} DROP CONSTRAINT ${quoteIdent(constraint)}${cascade ? ' CASCADE' : ''};`;
}

export function dropTriggerSql(rel: RelRef, trigger: string, cascade = false): string {
  return `DROP TRIGGER ${quoteIdent(trigger)} ON ${qualify(rel.schema, rel.name)}${cascade ? ' CASCADE' : ''};`;
}

export function refreshMatviewSql(rel: RelRef, concurrently = false): string {
  return `REFRESH MATERIALIZED VIEW${concurrently ? ' CONCURRENTLY' : ''} ${qualify(rel.schema, rel.name)};`;
}

export function restartSequenceSql(rel: RelRef): string {
  return `ALTER SEQUENCE ${qualify(rel.schema, rel.name)} RESTART;`;
}

/* ---- creation templates (DDL class: opened in a query tab for the user to edit) ---- */

export function createTableTemplate(schema: string): string {
  return [
    `CREATE TABLE ${quoteIdent(schema)}.new_table (`,
    '  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,',
    '  name text NOT NULL,',
    '  created_at timestamptz NOT NULL DEFAULT now()',
    ');'
  ].join('\n');
}

export function createViewTemplate(schema: string): string {
  return `CREATE OR REPLACE VIEW ${quoteIdent(schema)}.new_view AS\nSELECT 1 AS example;`;
}

export function createFunctionTemplate(schema: string): string {
  return [
    `CREATE OR REPLACE FUNCTION ${quoteIdent(schema)}.new_function(arg integer)`,
    'RETURNS integer',
    'LANGUAGE plpgsql',
    'AS $$',
    'BEGIN',
    '  RETURN arg * 2;',
    'END;',
    '$$;'
  ].join('\n');
}

export function createSchemaTemplate(): string {
  return 'CREATE SCHEMA new_schema;';
}

export function createDatabaseTemplate(): string {
  return "CREATE DATABASE new_database\n  WITH ENCODING 'UTF8';";
}

export function createExtensionTemplate(): string {
  return 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;';
}

export function editViewSql(rel: RelRef, definition: string | undefined, materialized: boolean): string {
  const head = materialized ? `CREATE MATERIALIZED VIEW ${qualify(rel.schema, rel.name)} AS` : `CREATE OR REPLACE VIEW ${qualify(rel.schema, rel.name)} AS`;
  return `${head}\n${(definition ?? 'SELECT …').trim()}`;
}

export function selectFromFunctionSql(rel: RelRef, args: string): string {
  const params = args.trim() ? args.split(',').map((_, i) => `$${i + 1}`).join(', ') : '';
  return `SELECT * FROM ${qualify(rel.schema, rel.name)}(${params});`;
}
