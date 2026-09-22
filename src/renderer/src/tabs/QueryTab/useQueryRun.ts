import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@renderer/store';
import {
  cancelRun,
  commitTx,
  defaultQueryRuntime,
  exactCount,
  getRuntime,
  patchRuntime,
  rollbackTx,
  runQuery,
  switchDatabase,
  type LimitChoice,
  type QueryTabRuntime,
  type ResultView
} from './runManager';

export interface QueryActions {
  run(sql: string, mode: 'script' | 'single', explain?: { analyze: boolean }): Promise<void>;
  loadMore(statementIndex: number): Promise<void>;
  cancel(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  exactCount(statementIndex: number): Promise<void>;
  switchDatabase(db: string): Promise<void>;
  setView(view: ResultView): void;
  setLimit(limit: LimitChoice): void;
  setTxMode(mode: 'auto' | 'manual'): void;
  setRatio(ratio: number): void;
  setCursor(pos: { line: number; col: number }): void;
}

/** Runtime + bound actions for one query tab. */
export function useQueryRun(tabId: string): { rt: QueryTabRuntime; actions: QueryActions; elapsedMs: number } {
  const rt = useStore(useShallow((s) => (s.tabRuntime[tabId] as QueryTabRuntime | undefined) ?? defaultQueryRuntime));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!rt.run.running) return;
    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [rt.run.running]);
  void tick;

  const elapsedMs = rt.run.running && rt.run.startedAt ? Date.now() - rt.run.startedAt : rt.run.durationMs ?? 0;

  const actions = useMemo<QueryActions>(
    () => ({
      run: (sql, mode, explain) => runQuery(tabId, sql, { mode, ...(explain ? { explain } : {}) }),
      loadMore: async (statementIndex) => {
        const res = getRuntime(tabId).run.results.find((r) => r.statementIndex === statementIndex);
        if (!res) return;
        // Re-executes the statement with double the rows received (documented: not a cursor continuation).
        await runQuery(tabId, res.statementText, { mode: 'single', rowCap: Math.min(200_000, Math.max(1000, res.rows.length * 2)) });
      },
      cancel: () => cancelRun(tabId),
      commit: () => commitTx(tabId),
      rollback: () => rollbackTx(tabId),
      exactCount: (i) => exactCount(tabId, i),
      switchDatabase: (db) => switchDatabase(tabId, db),
      setView: (view) => patchRuntime(tabId, { view }),
      setLimit: (limit) => patchRuntime(tabId, { limit }),
      setTxMode: (txMode) => patchRuntime(tabId, { txMode }),
      setRatio: (ratio) => patchRuntime(tabId, { ratio }),
      setCursor: (cursor) => {
        const cur = getRuntime(tabId).cursor;
        if (cur.line !== cursor.line || cur.col !== cursor.col) patchRuntime(tabId, { cursor });
      }
    }),
    [tabId]
  );

  return { rt, actions, elapsedMs };
}
