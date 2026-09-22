/** Structured PostgreSQL error, serialised across IPC. */
export interface PgErrorInfo {
  message: string;
  /** SQLSTATE, e.g. 42601. */
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  /** 1-based character offset into the statement text. */
  position?: number;
  internalPosition?: number;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  /** Index of the statement within the script that failed. */
  statementIndex?: number;
  /** 1-based line derived from `position`. */
  line?: number;
  /** 1-based column derived from `position`. */
  col?: number;
}

/** Plain JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** Marker meaning "use the column DEFAULT" in an insert/update. Consumes no parameter. */
export const DEFAULT_SENTINEL = { __pgtDefault: true } as const;

/** Type of DEFAULT_SENTINEL. */
export type DefaultSentinel = typeof DEFAULT_SENTINEL;

/**
 * A cell as transported over IPC.
 *
 * Rules:
 * - `null` is SQL NULL. An empty string is `''`. A JSON null inside a jsonb column is
 *   distinguishable only by the field's `dataType`.
 * - int8, numeric, money, date, time, timetz, timestamp, timestamptz, interval and their
 *   arrays arrive and are sent as strings; nothing ever converts them to Number.
 * - bytea is a `\x…` hex string.
 * - json/jsonb are parsed JSON values.
 * - DEFAULT_SENTINEL renders the SQL keyword DEFAULT in insert/update values.
 */
export type CellValue = JsonValue | DefaultSentinel;

/** True when a value is the DEFAULT sentinel. */
export function isDefaultSentinel(v: unknown): v is DefaultSentinel {
  return typeof v === 'object' && v !== null && (v as { __pgtDefault?: unknown }).__pgtDefault === true;
}

/** Column metadata for a result set (pg FieldDef subset plus the resolved type name). */
export interface FieldInfo {
  name: string;
  dataTypeID: number;
  /** Resolved type name, e.g. `int8`, `jsonb`, `_text`. */
  dataType: string;
  tableID: number;
  columnID: number;
}

/** Request to run a script or single statement. Results arrive on query:event. */
export interface RunQueryRequest {
  runId: string;
  connectionId: string;
  database: string;
  /** When set, runs on the tab's dedicated session client. */
  sessionId?: string;
  sql: string;
  mode: 'script' | 'single';
  rowCap?: number;
  pageSize?: number;
  continueOnError?: boolean;
  explain?: { analyze: boolean };
}

/** Streamed events for one run, strictly ordered start → (fields? rows* statementDone|error)+ → done|cancelled. */
export type QueryEvent =
  | { runId: string; type: 'start'; statementCount: number }
  | { runId: string; type: 'fields'; statementIndex: number; fields: FieldInfo[]; statementText: string }
  | { runId: string; type: 'rows'; statementIndex: number; rows: CellValue[][] }
  | {
      runId: string;
      type: 'statementDone';
      statementIndex: number;
      command: string;
      rowCount: number | null;
      truncated: boolean;
      durationMs: number;
    }
  | { runId: string; type: 'notice'; statementIndex: number; message: string; severity: string }
  | { runId: string; type: 'error'; statementIndex: number; error: PgErrorInfo }
  | { runId: string; type: 'cancelled' }
  | { runId: string; type: 'done'; durationMs: number };
