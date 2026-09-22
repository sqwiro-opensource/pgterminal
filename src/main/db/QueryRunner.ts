import type { FieldDef, Pool, PoolClient, QueryResult } from 'pg';
import Cursor from 'pg-cursor';
import type { CellValue, ConnectionMeta, FieldInfo, PgErrorInfo, QueryEvent, RunQueryRequest } from '@shared/ipc';
import { classifyStatement, returnsRows, splitStatements } from '@shared/sql/statementSplitter';
import { isCancelError, positionToLineCol, toPgErrorInfo } from './pgError';
import { createTypeParsers } from './typeParsers';
import { resolveFieldInfos } from './typeNames';
import type { SessionManager } from './SessionManager';

export interface RunnerDeps {
  getPool(connectionId: string, database: string): Pool;
  getMeta(connectionId: string): ConnectionMeta | undefined;
  sessions: SessionManager;
  /** Called after a DDL statement completes. */
  invalidateCatalog(connectionId: string, database: string): void | Promise<void>;
  settings(): { queryRowCap: number; resultBytesCapMb: number };
}

/** Live state of a run, used by cancel. */
export interface RunState {
  runId: string;
  connectionId: string;
  database: string;
  pid: number;
  cancelled: boolean;
}

/** Runs currently executing, by runId. */
export const runs = new Map<string, RunState>();

const HARD_ROW_CAP = 200_000;
const DEFAULT_PAGE_SIZE = 500;
const READ_ONLY_HINT = 'This connection was saved as read-only. Save it without the read-only flag to write.';

type Emit = (e: QueryEvent) => void;

interface CursorRead {
  rows: CellValue[][];
  /** Undefined on the final (empty) read — pg-cursor passes no result once the portal is exhausted. */
  result: QueryResult | undefined;
}

function readPage(cursor: Cursor<CellValue[]>, n: number): Promise<CursorRead> {
  return new Promise((resolve, reject) => {
    cursor.read(n, (err, rows, result) => {
      if (err) reject(err);
      else resolve({ rows, result });
    });
  });
}

const LOST_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006']);

/** True when the error means the backend/socket is gone and the session client must be reopened. */
function isConnectionLost(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && LOST_CODES.has(e.code)) return true;
  return /connection terminated|ECONNRESET|EPIPE|Client has encountered a connection error/i.test(e.message ?? '');
}

function pidOf(client: PoolClient): number {
  return (client as PoolClient & { processID?: number }).processID ?? 0;
}

/**
 * Executes a script or single statement, streaming events. Event order per run:
 * start → (fields? rows* statementDone | error)+ → done, or … → cancelled (no done after cancelled).
 */
export async function runQuery(req: RunQueryRequest, emit: Emit, deps: RunnerDeps): Promise<void> {
  const startedAt = Date.now();
  const statements: Array<{ text: string; start: number }> =
    req.mode === 'single'
      ? [{ text: req.sql.trim(), start: Math.max(0, req.sql.indexOf(req.sql.trim())) }].filter((s) => s.text.length > 0)
      : splitStatements(req.sql).map((s) => ({ text: s.text, start: s.start }));
  emit({ runId: req.runId, type: 'start', statementCount: statements.length });

  const meta = deps.getMeta(req.connectionId);
  const pool = deps.getPool(req.connectionId, req.database);
  const rowCap = Math.min(req.rowCap ?? deps.settings().queryRowCap, HARD_ROW_CAP);
  const bytesCap = Math.max(1, deps.settings().resultBytesCapMb) * 1024 * 1024;
  const pageSize = Math.max(1, Math.min(req.pageSize ?? DEFAULT_PAGE_SIZE, 5000));

  let client: PoolClient;
  let releaseClient: (() => void) | null = null;
  if (req.sessionId) {
    const s = await deps.sessions.get(req.sessionId);
    client = s.client;
  } else {
    client = await pool.connect();
    releaseClient = () => client.release();
  }

  const state: RunState = { runId: req.runId, connectionId: req.connectionId, database: req.database, pid: pidOf(client), cancelled: false };
  runs.set(req.runId, state);

  let statementIndex = -1;
  const onNotice = (n: { message?: string; severity?: string }) => {
    emit({ runId: req.runId, type: 'notice', statementIndex: Math.max(0, statementIndex), message: n.message ?? '', severity: n.severity ?? 'NOTICE' });
  };
  client.on('notice', onNotice);

  let finished: 'done' | 'cancelled' = 'done';
  try {
    for (let i = 0; i < statements.length; i++) {
      statementIndex = i;
      const stmt = statements[i] as { text: string; start: number };
      const raw = stmt.text;
      const kind = classifyStatement(raw);
      if (state.cancelled) {
        finished = 'cancelled';
        break;
      }
      if (meta?.readOnly && (kind === 'dml' || kind === 'ddl')) {
        emit({ runId: req.runId, type: 'error', statementIndex: i, error: { code: '25006', message: 'Connection is read-only', hint: READ_ONLY_HINT, statementIndex: i } });
        if (!req.continueOnError) break;
        continue;
      }
      const text = req.explain && (kind === 'select' || kind === 'dml') ? `EXPLAIN (FORMAT JSON, ANALYZE ${req.explain.analyze ? 'true' : 'false'}) ${raw}` : raw;
      const t0 = Date.now();
      try {
        if (returnsRows(text)) {
          await runCursor(client, pool, text, i, req.runId, pageSize, rowCap, bytesCap, state, emit, t0);
        } else {
          const r = await client.query({ text, rowMode: 'array' });
          emit({ runId: req.runId, type: 'statementDone', statementIndex: i, command: r.command ?? '', rowCount: r.rowCount, truncated: false, durationMs: Date.now() - t0 });
          if (req.sessionId) deps.sessions.noteCommand(req.sessionId, r.command, text, false);
        }
        if (kind === 'ddl') {
          try {
            await deps.invalidateCatalog(req.connectionId, req.database);
          } catch {
            // invalidation is best-effort
          }
        }
      } catch (err) {
        if (req.sessionId) {
          deps.sessions.noteCommand(req.sessionId, undefined, text, true);
          if (isConnectionLost(err)) deps.sessions.markDead(req.sessionId);
        }
        if (state.cancelled || isCancelError(err)) {
          finished = 'cancelled';
          break;
        }
        const info = toPgErrorInfo(err, text, i);
        emit({ runId: req.runId, type: 'error', statementIndex: i, error: toScriptPosition(info, req.sql, stmt.start, text.length - raw.length) });
        if (!req.continueOnError) break;
      }
    }
  } finally {
    client.off('notice', onNotice);
    runs.delete(req.runId);
    releaseClient?.();
  }
  if (finished === 'cancelled') emit({ runId: req.runId, type: 'cancelled' });
  else emit({ runId: req.runId, type: 'done', durationMs: Date.now() - startedAt });
}

async function runCursor(
  client: PoolClient,
  pool: Pool,
  text: string,
  i: number,
  runId: string,
  pageSize: number,
  rowCap: number,
  bytesCap: number,
  state: RunState,
  emit: Emit,
  t0: number
): Promise<void> {
  // pg-cursor builds its own Result, so the pool's per-pool type parsers must be passed explicitly.
  const cursor = client.query(new Cursor<CellValue[]>(text, [], { rowMode: 'array', types: createTypeParsers() }));
  let fields: FieldInfo[] | null = null;
  let rowCount = 0;
  let bytes = 0;
  let truncated = false;
  let command = 'SELECT';
  try {
    for (;;) {
      const want = Math.min(pageSize, rowCap - rowCount);
      const { rows, result } = await readPage(cursor, Math.max(1, want));
      if (!fields) {
        fields = await resolveFieldInfos(pool, (result?.fields ?? []) as FieldDef[]);
        emit({ runId, type: 'fields', statementIndex: i, fields, statementText: text });
      }
      if (result?.command) command = result.command;
      if (rows.length === 0) break;
      rowCount += rows.length;
      bytes += JSON.stringify(rows).length;
      emit({ runId, type: 'rows', statementIndex: i, rows });
      if (state.cancelled) throw Object.assign(new Error('cancelled'), { code: '57014' });
      if (rowCount >= rowCap || bytes >= bytesCap) {
        // Peek: are there more rows? If so the result is truncated.
        const peek = await readPage(cursor, 1);
        if (peek.rows.length > 0) truncated = true;
        break;
      }
    }
  } finally {
    await cursor.close().catch(() => undefined);
  }
  emit({ runId, type: 'statementDone', statementIndex: i, command, rowCount, truncated, durationMs: Date.now() - t0 });
}

/**
 * pg reports `position` relative to the single statement we sent. The editor shows the whole
 * script, so translate line/col into script coordinates (and drop the EXPLAIN prefix we added).
 */
function toScriptPosition(info: PgErrorInfo, script: string, statementStart: number, prefixLength: number): PgErrorInfo {
  if (info.position === undefined) return info;
  const inStatement = info.position - 1 - prefixLength;
  if (inStatement < 0) return info;
  const scriptIndex = statementStart + inStatement;
  return { ...info, ...positionToLineCol(script, scriptIndex + 1) };
}
