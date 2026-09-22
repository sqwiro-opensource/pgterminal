/**
 * Pure reducer folding streamed `query:event`s into a query tab's runtime state.
 * Rows are concatenated per batch; the UI appends them inside `startTransition`.
 */
import type { CellValue, FieldInfo, PgErrorInfo, QueryEvent } from '@shared/types/query';

export interface ResultSet {
  statementIndex: number;
  statementText: string;
  fields: FieldInfo[];
  rows: CellValue[][];
  rowCount: number | null;
  truncated: boolean;
  durationMs: number | null;
  command: string | null;
  error?: PgErrorInfo;
  notices: string[];
  /** statementDone or error arrived. */
  done: boolean;
}

export interface QueryMessage {
  ts: number;
  kind: 'notice' | 'error' | 'info';
  text: string;
  statementIndex?: number;
  error?: PgErrorInfo;
}

export interface QueryRunState {
  runId: string | null;
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  statementCount: number;
  /** Index of the statement currently executing (0-based); equals statementCount when finished. */
  currentStatement: number;
  results: ResultSet[];
  messages: QueryMessage[];
  cancelled: boolean;
  /** True when the run was an EXPLAIN. */
  explain: boolean;
}

export const initialRunState: QueryRunState = {
  runId: null,
  running: false,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  statementCount: 0,
  currentStatement: 0,
  results: [],
  messages: [],
  cancelled: false,
  explain: false
};

/** State for a run we are about to start (registered before `query:run` so early events are not lost). */
export function startingRunState(runId: string, explain: boolean, now = Date.now()): QueryRunState {
  return { ...initialRunState, runId, running: true, startedAt: now, explain };
}

function emptyResult(statementIndex: number, statementText = ''): ResultSet {
  return {
    statementIndex,
    statementText,
    fields: [],
    rows: [],
    rowCount: null,
    truncated: false,
    durationMs: null,
    command: null,
    notices: [],
    done: false
  };
}

/** Returns the results array with `statementIndex` upserted via `patch`; keeps statement order. */
function upsertResult(results: ResultSet[], statementIndex: number, patch: (r: ResultSet) => ResultSet): ResultSet[] {
  const i = results.findIndex((r) => r.statementIndex === statementIndex);
  if (i === -1) {
    const next = [...results, patch(emptyResult(statementIndex))];
    return next.sort((a, b) => a.statementIndex - b.statementIndex);
  }
  const next = results.slice();
  next[i] = patch(results[i] as ResultSet);
  return next;
}

export function describeDone(command: string | null, rowCount: number | null, durationMs: number | null): string {
  const cmd = command ?? 'OK';
  const rows = rowCount === null ? '' : ` ${rowCount}`;
  const ms = durationMs === null ? '' : ` · ${durationMs} ms`;
  return `${cmd}${rows}${ms}`;
}

/** Folds one event. Events for another run id are ignored (a stale run's late events cannot corrupt a new one). */
export function reduceQueryEvent(state: QueryRunState, ev: QueryEvent, now = Date.now()): QueryRunState {
  if (state.runId !== ev.runId) return state;
  switch (ev.type) {
    case 'start':
      return { ...state, running: true, startedAt: state.startedAt ?? now, statementCount: ev.statementCount, currentStatement: 0 };
    case 'fields':
      return {
        ...state,
        currentStatement: ev.statementIndex,
        results: upsertResult(state.results, ev.statementIndex, (r) => ({ ...r, fields: ev.fields, statementText: ev.statementText, rows: [] }))
      };
    case 'rows':
      return {
        ...state,
        results: upsertResult(state.results, ev.statementIndex, (r) => ({ ...r, rows: r.rows.length === 0 ? ev.rows : r.rows.concat(ev.rows) }))
      };
    case 'statementDone': {
      const results = upsertResult(state.results, ev.statementIndex, (r) => ({
        ...r,
        command: ev.command,
        rowCount: ev.rowCount,
        truncated: ev.truncated,
        durationMs: ev.durationMs,
        done: true
      }));
      const text = describeDone(ev.command, ev.rowCount, ev.durationMs) + (ev.truncated ? ' (truncated at cap)' : '');
      return {
        ...state,
        currentStatement: ev.statementIndex + 1,
        results,
        messages: [...state.messages, { ts: now, kind: 'info', text, statementIndex: ev.statementIndex }]
      };
    }
    case 'notice':
      return {
        ...state,
        results: upsertResult(state.results, ev.statementIndex, (r) => ({ ...r, notices: [...r.notices, ev.message] })),
        messages: [...state.messages, { ts: now, kind: 'notice', text: `${ev.severity}: ${ev.message}`, statementIndex: ev.statementIndex }]
      };
    case 'error':
      return {
        ...state,
        currentStatement: ev.statementIndex + 1,
        results: upsertResult(state.results, ev.statementIndex, (r) => ({ ...r, error: ev.error, done: true })),
        messages: [...state.messages, { ts: now, kind: 'error', text: ev.error.message, statementIndex: ev.statementIndex, error: ev.error }]
      };
    case 'cancelled':
      return {
        ...state,
        running: false,
        cancelled: true,
        finishedAt: now,
        durationMs: state.startedAt === null ? null : now - state.startedAt,
        messages: [...state.messages, { ts: now, kind: 'info', text: 'Query cancelled' }]
      };
    case 'done':
      return { ...state, running: false, finishedAt: now, durationMs: ev.durationMs, currentStatement: state.statementCount };
    default:
      return state;
  }
}

/** Total rows received across result sets. */
export function totalRows(state: QueryRunState): number {
  return state.results.reduce((n, r) => n + r.rows.length, 0);
}

/** Errors with a line/col, for editor markers. */
export function errorMarkers(state: QueryRunState): PgErrorInfo[] {
  return state.results.filter((r) => r.error).map((r) => r.error as PgErrorInfo);
}
