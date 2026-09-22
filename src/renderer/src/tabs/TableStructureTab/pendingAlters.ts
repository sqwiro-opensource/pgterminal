/**
 * Pure: pending column edits on a table → ALTER TABLE statements (text for the confirm dialog).
 * Every identifier goes through quoteIdent; defaults are emitted verbatim (they are SQL expressions).
 */
import type { ColumnInfo } from '@shared/types/catalog';
import { qualify, quoteIdent } from '@shared/sql/quote';

export interface ColumnEdit {
  name?: string;
  dataType?: string;
  nullable?: boolean;
  /** SQL expression; '' clears the default. */
  default?: string;
  comment?: string;
}

export interface NewColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string;
  primaryKey?: boolean;
  identity?: 'always' | 'by default' | null;
  comment?: string;
}

export interface PendingAlters {
  edits: Record<string, ColumnEdit>;
  added: NewColumn[];
  dropped: string[];
}

export const NO_ALTERS: PendingAlters = { edits: {}, added: [], dropped: [] };

export function alterCount(p: PendingAlters): number {
  return Object.values(p.edits).reduce((n, e) => n + Object.keys(e).length, 0) + p.added.length + p.dropped.length;
}

/** Records an edit; an edit equal to the current column value is dropped again. */
export function editColumn(p: PendingAlters, col: ColumnInfo, patch: ColumnEdit): PendingAlters {
  const cur = { ...(p.edits[col.name] ?? {}) };
  for (const [k, v] of Object.entries(patch) as Array<[keyof ColumnEdit, ColumnEdit[keyof ColumnEdit]]>) {
    const original: ColumnEdit[keyof ColumnEdit] =
      k === 'name' ? col.name : k === 'dataType' ? col.dataType : k === 'nullable' ? col.nullable : k === 'default' ? (col.default ?? '') : (col.comment ?? '');
    if (v === original || v === undefined) delete cur[k];
    else (cur as Record<string, unknown>)[k] = v;
  }
  const edits = { ...p.edits };
  if (Object.keys(cur).length === 0) delete edits[col.name];
  else edits[col.name] = cur;
  return { ...p, edits };
}

export function addColumn(p: PendingAlters, col: NewColumn): PendingAlters {
  return { ...p, added: [...p.added, col] };
}

export function updateAdded(p: PendingAlters, index: number, patch: Partial<NewColumn>): PendingAlters {
  return { ...p, added: p.added.map((c, i) => (i === index ? { ...c, ...patch } : c)) };
}

export function removeAdded(p: PendingAlters, index: number): PendingAlters {
  return { ...p, added: p.added.filter((_, i) => i !== index) };
}

export function dropColumn(p: PendingAlters, name: string): PendingAlters {
  if (p.dropped.includes(name)) return p;
  const edits = { ...p.edits };
  delete edits[name];
  return { ...p, edits, dropped: [...p.dropped, name] };
}

export function undropColumn(p: PendingAlters, name: string): PendingAlters {
  return { ...p, dropped: p.dropped.filter((n) => n !== name) };
}

/** Column definition text for ADD COLUMN / CREATE TABLE. */
export function columnDef(c: NewColumn, inlinePk = true): string {
  const parts = [quoteIdent(c.name), c.dataType.trim() || 'text'];
  if (c.identity) parts.push(`GENERATED ${c.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`);
  if (!c.nullable) parts.push('NOT NULL');
  if (c.default.trim()) parts.push(`DEFAULT ${c.default.trim()}`);
  if (c.primaryKey && inlinePk) parts.push('PRIMARY KEY');
  return parts.join(' ');
}

function sqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** ALTER TABLE statements in a safe order: drops, adds, type/null/default changes, comments, renames last. */
export function buildAlterStatements(schema: string, table: string, columns: ColumnInfo[], p: PendingAlters): string[] {
  const t = qualify(schema, table);
  const out: string[] = [];
  for (const name of p.dropped) out.push(`ALTER TABLE ${t} DROP COLUMN ${quoteIdent(name)};`);
  for (const c of p.added) {
    out.push(`ALTER TABLE ${t} ADD COLUMN ${columnDef(c)};`);
    if (c.comment?.trim()) out.push(`COMMENT ON COLUMN ${t}.${quoteIdent(c.name)} IS ${sqlLiteral(c.comment.trim())};`);
  }
  const renames: string[] = [];
  for (const [name, e] of Object.entries(p.edits)) {
    if (!columns.some((c) => c.name === name)) continue;
    const col = quoteIdent(name);
    if (e.dataType !== undefined) out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} TYPE ${e.dataType.trim()};`);
    if (e.nullable !== undefined) out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} ${e.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`);
    if (e.default !== undefined) out.push(e.default.trim() ? `ALTER TABLE ${t} ALTER COLUMN ${col} SET DEFAULT ${e.default.trim()};` : `ALTER TABLE ${t} ALTER COLUMN ${col} DROP DEFAULT;`);
    if (e.comment !== undefined) out.push(`COMMENT ON COLUMN ${t}.${col} IS ${e.comment.trim() ? sqlLiteral(e.comment.trim()) : 'NULL'};`);
    if (e.name !== undefined && e.name.trim() && e.name !== name) renames.push(`ALTER TABLE ${t} RENAME COLUMN ${col} TO ${quoteIdent(e.name.trim())};`);
  }
  return [...out, ...renames];
}

/** CREATE TABLE text for the create-table dialog; multi-column PKs become a table constraint. */
export function buildCreateTable(schema: string, table: string, columns: NewColumn[]): string {
  const pk = columns.filter((c) => c.primaryKey);
  const inline = pk.length === 1;
  const defs = columns.map((c) => `  ${columnDef(c, inline)}`);
  if (pk.length > 1) defs.push(`  PRIMARY KEY (${pk.map((c) => quoteIdent(c.name)).join(', ')})`);
  const lines = [`CREATE TABLE ${qualify(schema, table)} (`, defs.join(',\n'), ');'];
  for (const c of columns) if (c.comment?.trim()) lines.push(`COMMENT ON COLUMN ${qualify(schema, table)}.${quoteIdent(c.name)} IS ${sqlLiteral(c.comment.trim())};`);
  return lines.join('\n');
}

/** CREATE INDEX text. */
export function buildCreateIndex(schema: string, table: string, o: { name: string; columns: string[]; unique: boolean; method: string; where?: string; concurrently?: boolean }): string {
  const cols = o.columns.map(quoteIdent).join(', ');
  const name = o.name.trim() || `${table}_${o.columns.join('_')}_idx`;
  return `CREATE ${o.unique ? 'UNIQUE ' : ''}INDEX ${o.concurrently ? 'CONCURRENTLY ' : ''}${quoteIdent(name)} ON ${qualify(schema, table)} USING ${o.method || 'btree'} (${cols})${o.where?.trim() ? ` WHERE ${o.where.trim()}` : ''};`;
}

export function buildAddConstraint(schema: string, table: string, name: string, definition: string): string {
  return `ALTER TABLE ${qualify(schema, table)} ADD CONSTRAINT ${quoteIdent(name.trim())} ${definition.trim()};`;
}

export function buildValidateConstraint(schema: string, table: string, name: string): string {
  return `ALTER TABLE ${qualify(schema, table)} VALIDATE CONSTRAINT ${quoteIdent(name)};`;
}

export function buildToggleTrigger(schema: string, table: string, name: string, enable: boolean): string {
  return `ALTER TABLE ${qualify(schema, table)} ${enable ? 'ENABLE' : 'DISABLE'} TRIGGER ${quoteIdent(name)};`;
}

export function buildReindex(schema: string, index: string): string {
  return `REINDEX INDEX ${qualify(schema, index)};`;
}
