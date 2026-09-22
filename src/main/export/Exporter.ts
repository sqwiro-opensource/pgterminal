/**
 * Result-set export: CSV (RFC 4180), JSON (numeric fields as bare literals, verbatim) and SQL INSERTs.
 * Pure string builders plus `writeExport`, which shows the save dialog and writes the file.
 */
import { writeFile } from 'fs/promises';
import { dialog } from 'electron';
import format from 'pg-format';
import { isDefaultSentinel, type CellValue, type ExportRequest, type FieldInfo } from '@shared/ipc';

const NUMERIC_TYPES = new Set([
  'int2', 'int4', 'int8', 'smallint', 'integer', 'bigint', 'numeric', 'decimal', 'float4', 'float8',
  'real', 'double precision', 'money', 'oid'
]);

/** True when a pg type name is numeric (values arrive as strings but must be emitted bare). */
export function isNumericType(dataType: string): boolean {
  return NUMERIC_TYPES.has(dataType.trim().toLowerCase().replace(/\(.*\)$/, ''));
}

function isJsonType(dataType: string): boolean {
  const t = dataType.trim().toLowerCase();
  return t === 'json' || t === 'jsonb';
}

/** Cell → text for CSV/TSV: NULL → '', objects → JSON, DEFAULT → ''. */
export function cellToText(v: CellValue | undefined): string {
  if (v === null || v === undefined || isDefaultSentinel(v)) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** RFC 4180 field: quote when it contains a comma, quote, CR or LF; embedded quotes doubled. */
function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a header row, CRLF line endings, NULL as an empty field, numeric strings unquoted. */
export function toCsv(fields: FieldInfo[], rows: CellValue[][]): string {
  const lines = [fields.map((f) => csvField(f.name)).join(',')];
  for (const row of rows) lines.push(fields.map((_, i) => csvField(cellToText(row[i]))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** A bare numeric literal is valid JSON only when it looks like a JSON number; otherwise quote it. */
const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

function jsonCell(v: CellValue | undefined, f: FieldInfo): string {
  if (v === null || v === undefined || isDefaultSentinel(v)) return 'null';
  if (isNumericType(f.dataType) && typeof v === 'string') return JSON_NUMBER.test(v) ? v : JSON.stringify(v);
  return JSON.stringify(v);
}

/** JSON array of objects; numeric-typed fields are written verbatim as bare literals (no precision loss). */
export function toJson(fields: FieldInfo[], rows: CellValue[][]): string {
  const objects = rows.map((row) => `  {${fields.map((f, i) => `${JSON.stringify(f.name)}: ${jsonCell(row[i], f)}`).join(', ')}}`);
  return `[\n${objects.join(',\n')}\n]\n`;
}

function sqlValue(v: CellValue | undefined, f: FieldInfo): string {
  if (v === null || v === undefined) return 'NULL';
  if (isDefaultSentinel(v)) return 'DEFAULT';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `${format.literal(JSON.stringify(v))}::${isJsonType(f.dataType) ? 'jsonb' : f.dataType}`;
  if (isNumericType(f.dataType) && JSON_NUMBER.test(v)) return v;
  return format.literal(v);
}

/** One INSERT per row, identifiers quoted with pg-format. */
export function toSqlInserts(fields: FieldInfo[], rows: CellValue[][], target: { schema: string; table: string }): string {
  const cols = fields.map((f) => format.ident(f.name)).join(', ');
  const into = `${format.ident(target.schema)}.${format.ident(target.table)}`;
  return rows.map((row) => `INSERT INTO ${into} (${cols}) VALUES (${fields.map((f, i) => sqlValue(row[i], f)).join(', ')});`).join('\n') + '\n';
}

/** Serialise per format. */
export function serialize(req: ExportRequest): string {
  if (req.format === 'csv') return toCsv(req.fields, req.rows);
  if (req.format === 'json') return toJson(req.fields, req.rows);
  return toSqlInserts(req.fields, req.rows, req.table ?? { schema: 'public', table: 'export' });
}

const EXT: Record<ExportRequest['format'], { ext: string; name: string }> = {
  csv: { ext: 'csv', name: 'CSV' },
  json: { ext: 'json', name: 'JSON' },
  sql: { ext: 'sql', name: 'SQL' }
};

/** Shows the save dialog and writes the file; null when the user cancels. */
export async function writeExport(req: ExportRequest): Promise<{ path: string } | null> {
  const { ext, name } = EXT[req.format];
  const base = req.suggestedName.replace(/\.[a-z]+$/i, '');
  const res = await dialog.showSaveDialog({
    defaultPath: `${base}.${ext}`,
    filters: [{ name, extensions: [ext] }]
  });
  if (res.canceled || !res.filePath) return null;
  await writeFile(res.filePath, serialize(req), 'utf8');
  return { path: res.filePath };
}
