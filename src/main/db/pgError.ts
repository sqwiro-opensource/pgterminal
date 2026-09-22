import type { PgErrorInfo } from '@shared/ipc';

/** SQLSTATE raised when a statement is cancelled by pg_cancel_backend / a timeout. */
export const CANCEL_CODE = '57014';

const SOCKET_HINTS: Record<string, string> = {
  ECONNREFUSED: 'Nothing is listening on that host/port. Is the server up and reachable (Tailscale up)?',
  ETIMEDOUT: 'The connection attempt timed out. Is the server reachable (Tailscale up)?',
  ENOTFOUND: 'The host name could not be resolved. Check the host field.',
  ECONNRESET: 'The connection was reset by the server or the network.',
  EHOSTUNREACH: 'The host is unreachable. Is the server reachable (Tailscale up)?'
};

type ErrLike = {
  message?: unknown;
  code?: unknown;
  severity?: unknown;
  detail?: unknown;
  hint?: unknown;
  position?: unknown;
  internalPosition?: unknown;
  internalQuery?: unknown;
  where?: unknown;
  schema?: unknown;
  table?: unknown;
  column?: unknown;
  dataType?: unknown;
  constraint?: unknown;
};

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

/** Compute 1-based line/col of a 1-based character position within `text`. */
export function positionToLineCol(text: string, position: number): { line: number; col: number } {
  const idx = Math.max(0, Math.min(position - 1, text.length));
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNl = i;
    }
  }
  return { line, col: idx - lastNl };
}

/** Convert any thrown value into the serialisable PgErrorInfo shape. */
export function toPgErrorInfo(err: unknown, statementText?: string, statementIndex?: number): PgErrorInfo {
  const info: PgErrorInfo = { message: '' };
  if (err && typeof err === 'object') {
    const e = err as ErrLike;
    info.message = str(e.message) ?? String(err);
    const code = str(e.code);
    if (code) info.code = code;
    const severity = str(e.severity);
    if (severity) info.severity = severity;
    const detail = str(e.detail);
    if (detail) info.detail = detail;
    const hint = str(e.hint);
    if (hint) info.hint = hint;
    const position = num(e.position);
    if (position !== undefined) info.position = position;
    const internalPosition = num(e.internalPosition);
    if (internalPosition !== undefined) info.internalPosition = internalPosition;
    const internalQuery = str(e.internalQuery);
    if (internalQuery) info.internalQuery = internalQuery;
    const where = str(e.where);
    if (where) info.where = where;
    const schema = str(e.schema);
    if (schema) info.schema = schema;
    const table = str(e.table);
    if (table) info.table = table;
    const column = str(e.column);
    if (column) info.column = column;
    const dataType = str(e.dataType);
    if (dataType) info.dataType = dataType;
    const constraint = str(e.constraint);
    if (constraint) info.constraint = constraint;
    if (code && !info.hint && SOCKET_HINTS[code]) info.hint = SOCKET_HINTS[code];
  } else {
    info.message = String(err);
  }
  if (statementIndex !== undefined) info.statementIndex = statementIndex;
  if (info.position !== undefined && statementText !== undefined) {
    const { line, col } = positionToLineCol(statementText, info.position);
    info.line = line;
    info.col = col;
  }
  return info;
}

/** True when the error is a server-side cancellation (SQLSTATE 57014). */
export function isCancelError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as ErrLike).code === CANCEL_CODE;
}
