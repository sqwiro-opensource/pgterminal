import { describe, expect, it } from 'vitest';
import type { QueryEvent } from '../../../src/shared/types/query';
import {
  errorMarkers,
  reduceQueryEvent,
  startingRunState,
  totalRows,
  type QueryRunState
} from '../../../src/renderer/src/tabs/QueryTab/queryRuntime';

const RUN = 'run-1';
const F = (name: string) => ({ name, dataTypeID: 23, dataType: 'int4', tableID: 0, columnID: 0 });

function fold(events: QueryEvent[], start = startingRunState(RUN, false, 1000)): QueryRunState {
  let s = start;
  let t = 1000;
  for (const ev of events) s = reduceQueryEvent(s, ev, (t += 10));
  return s;
}

describe('reduceQueryEvent', () => {
  it('keeps five statements in order with one result entry each', () => {
    const events: QueryEvent[] = [{ runId: RUN, type: 'start', statementCount: 5 }];
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        events.push({ runId: RUN, type: 'fields', statementIndex: i, fields: [F('n')], statementText: `SELECT ${i}` });
        events.push({ runId: RUN, type: 'rows', statementIndex: i, rows: [[i]] });
        events.push({ runId: RUN, type: 'statementDone', statementIndex: i, command: 'SELECT', rowCount: 1, truncated: false, durationMs: 3 });
      } else {
        events.push({ runId: RUN, type: 'statementDone', statementIndex: i, command: 'UPDATE', rowCount: 3, truncated: false, durationMs: 12 });
      }
    }
    events.push({ runId: RUN, type: 'done', durationMs: 40 });
    const s = fold(events);
    expect(s.results.map((r) => r.statementIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(s.results.map((r) => r.command)).toEqual(['SELECT', 'UPDATE', 'SELECT', 'UPDATE', 'SELECT']);
    expect(s.results[1]?.rowCount).toBe(3);
    expect(s.running).toBe(false);
    expect(s.durationMs).toBe(40);
    expect(s.currentStatement).toBe(5);
    expect(s.messages.filter((m) => m.kind === 'info').map((m) => m.text)).toContain('UPDATE 3 · 12 ms');
    expect(totalRows(s)).toBe(3);
  });

  it('an error at statement 4 keeps results 1–3 and adds an error message with markers', () => {
    const s = fold([
      { runId: RUN, type: 'start', statementCount: 5 },
      { runId: RUN, type: 'statementDone', statementIndex: 0, command: 'CREATE', rowCount: null, truncated: false, durationMs: 1 },
      { runId: RUN, type: 'statementDone', statementIndex: 1, command: 'INSERT', rowCount: 2, truncated: false, durationMs: 1 },
      { runId: RUN, type: 'fields', statementIndex: 2, fields: [F('id')], statementText: 'SELECT id FROM t' },
      { runId: RUN, type: 'rows', statementIndex: 2, rows: [[1], [2]] },
      { runId: RUN, type: 'statementDone', statementIndex: 2, command: 'SELECT', rowCount: 2, truncated: false, durationMs: 2 },
      { runId: RUN, type: 'error', statementIndex: 3, error: { message: 'syntax error at or near "SELEC"', code: '42601', line: 4, col: 1 } },
      { runId: RUN, type: 'done', durationMs: 9 }
    ]);
    expect(s.results.filter((r) => r.done && !r.error)).toHaveLength(3);
    expect(s.results[3]?.error?.code).toBe('42601');
    const errs = s.messages.filter((m) => m.kind === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.error?.line).toBe(4);
    expect(errorMarkers(s).map((e) => e.code)).toEqual(['42601']);
    expect(s.running).toBe(false);
  });

  it('cancelled ends the run without a done event', () => {
    const s = fold([
      { runId: RUN, type: 'start', statementCount: 1 },
      { runId: RUN, type: 'fields', statementIndex: 0, fields: [F('x')], statementText: 'SELECT pg_sleep(30)' },
      { runId: RUN, type: 'cancelled' }
    ]);
    expect(s.running).toBe(false);
    expect(s.cancelled).toBe(true);
    expect(s.finishedAt).not.toBeNull();
    expect(s.messages.at(-1)?.text).toBe('Query cancelled');
  });

  it('appends row batches and preserves order', () => {
    const s = fold([
      { runId: RUN, type: 'start', statementCount: 1 },
      { runId: RUN, type: 'fields', statementIndex: 0, fields: [F('n')], statementText: 'SELECT n' },
      { runId: RUN, type: 'rows', statementIndex: 0, rows: [[1], [2]] },
      { runId: RUN, type: 'rows', statementIndex: 0, rows: [[3]] },
      { runId: RUN, type: 'rows', statementIndex: 0, rows: [[4], [5]] },
      { runId: RUN, type: 'statementDone', statementIndex: 0, command: 'SELECT', rowCount: 5, truncated: true, durationMs: 2 }
    ]);
    expect(s.results[0]?.rows.map((r) => r[0])).toEqual([1, 2, 3, 4, 5]);
    expect(s.results[0]?.truncated).toBe(true);
    expect(s.messages.at(-1)?.text).toContain('truncated');
  });

  it('records notices on the statement and in messages', () => {
    const s = fold([
      { runId: RUN, type: 'start', statementCount: 1 },
      { runId: RUN, type: 'notice', statementIndex: 0, message: 'hello from plpgsql', severity: 'NOTICE' },
      { runId: RUN, type: 'statementDone', statementIndex: 0, command: 'DO', rowCount: null, truncated: false, durationMs: 1 }
    ]);
    expect(s.results[0]?.notices).toEqual(['hello from plpgsql']);
    expect(s.messages[0]?.kind).toBe('notice');
    expect(s.messages[0]?.text).toBe('NOTICE: hello from plpgsql');
  });

  it('ignores events from another run id', () => {
    const start = startingRunState(RUN, false, 1000);
    const s = reduceQueryEvent(start, { runId: 'other', type: 'done', durationMs: 5 });
    expect(s).toBe(start);
    expect(s.running).toBe(true);
  });
});
