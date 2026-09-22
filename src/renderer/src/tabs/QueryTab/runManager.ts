/**
 * Owns query execution for every query tab, independent of whether the tab is mounted:
 * one `query:event` subscription, per-tab run state kept in `tabRuntime`, session lifecycle,
 * manual-transaction bookkeeping and cleanup when a tab closes. No Monaco imports here — the
 * tree actions and the status bar import this module without pulling the editor chunk.
 */
import { startTransition } from 'react';
import { toast } from 'sonner';
import type { CellValue, PgErrorInfo, QueryEvent, RunQueryRequest } from '@shared/types/query';
import type { Tab } from '@shared/types/workspace';
import { classifyStatement, splitStatements } from '@shared/sql/statementSplitter';
import { getApi } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { confirm, useConfirmStore } from '@renderer/components/ui/ConfirmDialog';
import { initialRunState, reduceQueryEvent, startingRunState, type QueryRunState } from './queryRuntime';

export type TxState = 'none' | 'open' | 'aborted';
export type ResultView = number | 'messages' | 'explain';
export type LimitChoice = 100 | 500 | 1000 | 5000 | 'none';

/** Per-tab transient state stored under `tabRuntime[tabId]` (never persisted). */
export interface QueryTabRuntime {
  run: QueryRunState;
  view: ResultView;
  /** Editor/results split ratio (percent for the editor panel). */
  ratio: number;
  limit: LimitChoice;
  txMode: 'auto' | 'manual';
  tx: { state: TxState; statements: number; startedAt: number | null };
  cursor: { line: number; col: number };
  /** Set by "Show in editor" / after errors; cleared on the next run. */
  markers: PgErrorInfo[];
  lastRowCount: number | null;
  lastDurationMs: number | null;
  /** Exact counts requested per statement index. */
  exactCounts: Record<number, string>;
}

export const defaultQueryRuntime: QueryTabRuntime = {
  run: initialRunState,
  view: 0,
  ratio: 45,
  limit: 500,
  txMode: 'auto',
  tx: { state: 'none', statements: 0, startedAt: null },
  cursor: { line: 1, col: 1 },
  markers: [],
  lastRowCount: null,
  lastDurationMs: null,
  exactCounts: {}
};

const HARD_ROW_CAP = 200_000;

export function rowCapFor(limit: LimitChoice): number {
  return limit === 'none' ? HARD_ROW_CAP : limit;
}

/** A run that belongs to a tab's main result area, or an auxiliary run resolved as a promise. */
type RunTarget =
  | { kind: 'tab'; tabId: string }
  | { kind: 'aux'; tabId: string; rows: CellValue[][]; resolve(rows: CellValue[][]): void; reject(err: Error): void };

const runs = new Map<string, RunTarget>();
const sessions = new Map<string, { sessionId: string; opened: boolean }>();
let subscribed = false;
let cleanupInstalled = false;
let historyTimer: ReturnType<typeof setTimeout> | null = null;

export function getRuntime(tabId: string): QueryTabRuntime {
  return (useStore.getState().tabRuntime[tabId] as QueryTabRuntime | undefined) ?? defaultQueryRuntime;
}

export function patchRuntime(tabId: string, patch: Partial<QueryTabRuntime>): void {
  const current = getRuntime(tabId);
  useStore.getState().setTabRuntime(tabId, { ...current, ...patch });
}

function queryTab(tabId: string): Tab<'query'> | undefined {
  const tab = useStore.getState().tabs.find((t) => t.id === tabId);
  return tab && tab.kind === 'query' ? (tab as Tab<'query'>) : undefined;
}

function scheduleHistoryRefresh(): void {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    const s = useStore.getState() as { loadHistory?: () => Promise<void> };
    void s.loadHistory?.().catch(() => undefined);
  }, 300);
}

/** Updates transaction bookkeeping from the statements that just ran. */
function trackTransaction(tabId: string, sql: string, failed: boolean): void {
  const rt = getRuntime(tabId);
  let tx = { ...rt.tx };
  const kinds = splitStatements(sql).map((st) => ({ kind: classifyStatement(st.text), text: st.text }));
  for (const k of kinds) {
    if (k.kind !== 'tcl') {
      if (tx.state !== 'none') tx.statements += 1;
      continue;
    }
    const head = k.text.trim().slice(0, 12).toUpperCase();
    if (head.startsWith('BEGIN') || head.startsWith('START')) tx = { state: 'open', statements: 0, startedAt: Date.now() };
    else if (head.startsWith('COMMIT') || head.startsWith('END') || (head.startsWith('ROLLBACK') && !/^ROLLBACK\s+TO/i.test(k.text.trim())))
      tx = { state: 'none', statements: 0, startedAt: null };
  }
  if (failed && tx.state === 'open') tx.state = 'aborted';
  patchRuntime(tabId, { tx });
}

function onEvent(ev: QueryEvent): void {
  const target = runs.get(ev.runId);
  if (!target) return;
  if (target.kind === 'aux') {
    if (ev.type === 'rows') target.rows.push(...ev.rows);
    else if (ev.type === 'error') {
      runs.delete(ev.runId);
      target.reject(Object.assign(new Error(ev.error.message), { info: ev.error }));
    } else if (ev.type === 'done' || ev.type === 'cancelled') {
      runs.delete(ev.runId);
      target.resolve(target.rows);
    }
    return;
  }
  const { tabId } = target;
  const apply = (): void => {
    const rt = getRuntime(tabId);
    const run = reduceQueryEvent(rt.run, ev);
    if (run === rt.run) return;
    const patch: Partial<QueryTabRuntime> = { run };
    if (ev.type === 'error') patch.view = 'messages';
    if (ev.type === 'done' || ev.type === 'cancelled') {
      patch.lastDurationMs = run.durationMs;
      patch.lastRowCount = run.results.reduce((n, r) => n + (r.rowCount ?? r.rows.length), 0);
      patch.markers = run.results.filter((r) => r.error?.line).map((r) => r.error as PgErrorInfo);
      if (run.explain) patch.view = 'explain';
      else if (patch.view === undefined && run.results.length > 0 && !run.results.some((r) => r.error)) {
        const first = run.results.findIndex((r) => r.fields.length > 0);
        patch.view = first === -1 ? 'messages' : first;
      }
    }
    patchRuntime(tabId, patch);
  };
  if (ev.type === 'rows') startTransition(apply);
  else apply();
  if (ev.type === 'done' || ev.type === 'cancelled') {
    runs.delete(ev.runId);
    scheduleHistoryRefresh();
  }
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  try {
    getApi().on('query:event', onEvent);
  } catch (err) {
    subscribed = false;
    console.warn('query:event subscription failed', (err as Error).message);
  }
  installCleanup();
}

/** Closes sessions and clears runtime when a query tab disappears from the workspace. */
function installCleanup(): void {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  let known = new Set<string>();
  const sync = (tabs: Tab[]): void => {
    const next = new Set(tabs.filter((t) => t.kind === 'query').map((t) => t.id));
    for (const id of known) {
      if (!next.has(id)) {
        useStore.getState().registerCloseGuard(id, null);
        void disposeTab(id);
      }
    }
    for (const id of next) {
      if (!known.has(id)) useStore.getState().registerCloseGuard(id, () => closeGuard(id));
    }
    known = next;
  };
  sync(useStore.getState().tabs);
  useStore.subscribe((s, prev) => {
    if (s.tabs !== prev.tabs) sync(s.tabs);
  });
}

/** Close guard: a tab with an open/aborted transaction asks before closing (Rollback & close). */
function closeGuard(tabId: string): Promise<boolean> {
  const rt = getRuntime(tabId);
  if (rt.tx.state === 'none') return Promise.resolve(true);
  const tab = useStore.getState().tabs.find((t) => t.id === tabId);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      unsub();
      resolve(ok);
    };
    const unsub = useConfirmStore.subscribe((s, prev) => {
      if (prev.spec && !s.spec) finish(false);
    });
    confirm({
      title: `Close ${tab?.title ?? 'query tab'}?`,
      verb: 'Rollback & close',
      variant: 'light',
      summary: `This tab has an ${rt.tx.state} transaction with ${rt.tx.statements} statement${rt.tx.statements === 1 ? '' : 's'}. Closing rolls it back.`,
      buildSql: () => 'ROLLBACK;',
      onConfirm: async () => {
        await rollbackTx(tabId).catch(() => undefined);
        finish(true);
      }
    });
  });
}

async function disposeTab(tabId: string): Promise<void> {
  const sess = sessions.get(tabId);
  sessions.delete(tabId);
  useStore.getState().clearTabRuntime(tabId);
  if (sess?.opened) await getApi()['session:close']({ sessionId: sess.sessionId }).catch(() => undefined);
  try {
    const { disposeEditorModel } = await import('@renderer/features/editor/editorModels');
    disposeEditorModel(tabId);
  } catch {
    // editor never loaded
  }
}

async function ensureSession(tab: Tab<'query'>): Promise<string> {
  const { connectionId, database, sessionId } = tab.params;
  const sess = sessions.get(tab.id);
  if (sess?.opened && sess.sessionId === sessionId) return sessionId;
  if (sess?.opened && sess.sessionId !== sessionId) await getApi()['session:close']({ sessionId: sess.sessionId }).catch(() => undefined);
  await getApi()['session:open']({ sessionId, connectionId, database });
  sessions.set(tab.id, { sessionId, opened: true });
  return sessionId;
}

/** Runs a script or single statement for a tab; results stream into `tabRuntime[tabId].run`. */
export async function runQuery(tabId: string, sql: string, opts: { mode: 'script' | 'single'; explain?: { analyze: boolean }; rowCap?: number } ): Promise<void> {
  const tab = queryTab(tabId);
  if (!tab) return;
  ensureSubscribed();
  const rt = getRuntime(tabId);
  if (rt.run.running) {
    toast.info('A query is already running in this tab');
    return;
  }
  const text = sql.trim();
  if (!text) return;
  try {
    const sessionId = await ensureSession(tab);
    let script = text;
    if (rt.txMode === 'manual' && rt.tx.state === 'none' && opts.mode === 'script' && !opts.explain) {
      script = `BEGIN;\n${text}`;
    }
    const runId = crypto.randomUUID();
    runs.set(runId, { kind: 'tab', tabId });
    patchRuntime(tabId, { run: startingRunState(runId, Boolean(opts.explain)), markers: [], view: 0, exactCounts: {} });
    const req: RunQueryRequest = {
      runId,
      connectionId: tab.params.connectionId,
      database: tab.params.database,
      sessionId,
      sql: script,
      mode: opts.mode,
      rowCap: opts.rowCap ?? rowCapFor(rt.limit),
      pageSize: 500,
      continueOnError: false,
      ...(opts.explain ? { explain: opts.explain } : {})
    };
    await getApi()['query:run'](req);
    await waitForRun(runId);
    const done = getRuntime(tabId).run;
    trackTransaction(tabId, script, done.results.some((r) => Boolean(r.error)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = getRuntime(tabId);
    patchRuntime(tabId, {
      run: { ...current.run, running: false, finishedAt: Date.now(), messages: [...current.run.messages, { ts: Date.now(), kind: 'error', text: message, error: { message } }] },
      view: 'messages'
    });
    // A dead session must be re-opened next time.
    const sess = sessions.get(tabId);
    if (sess && /session|connection|terminat/i.test(message)) sessions.set(tabId, { ...sess, opened: false });
  }
}

function waitForRun(runId: string): Promise<void> {
  return new Promise((resolve) => {
    const check = (): void => {
      if (!runs.has(runId)) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

/** Runs a statement on the tab's session and resolves with its rows (no result tab). */
export async function runAux(tabId: string, sql: string): Promise<CellValue[][]> {
  const tab = queryTab(tabId);
  if (!tab) throw new Error('tab is not open');
  ensureSubscribed();
  const sessionId = await ensureSession(tab);
  const runId = crypto.randomUUID();
  const p = new Promise<CellValue[][]>((resolve, reject) => {
    runs.set(runId, { kind: 'aux', tabId, rows: [], resolve, reject });
  });
  await getApi()['query:run']({ runId, connectionId: tab.params.connectionId, database: tab.params.database, sessionId, sql, mode: 'single', rowCap: 1000, pageSize: 1000 });
  return p;
}

export async function cancelRun(tabId: string): Promise<void> {
  const rt = getRuntime(tabId);
  if (!rt.run.runId || !rt.run.running) return;
  await getApi()['query:cancel']({ runId: rt.run.runId });
}

export async function commitTx(tabId: string): Promise<void> {
  await runAux(tabId, 'COMMIT');
  patchRuntime(tabId, { tx: { state: 'none', statements: 0, startedAt: null } });
  toast.success('Transaction committed');
}

export async function rollbackTx(tabId: string): Promise<void> {
  await runAux(tabId, 'ROLLBACK');
  patchRuntime(tabId, { tx: { state: 'none', statements: 0, startedAt: null } });
  toast.info('Transaction rolled back');
}

/** Runs `SELECT count(*)` for one result set's statement and stores it in `exactCounts`. */
export async function exactCount(tabId: string, statementIndex: number): Promise<void> {
  const rt = getRuntime(tabId);
  const res = rt.run.results.find((r) => r.statementIndex === statementIndex);
  if (!res) return;
  const inner = res.statementText.trim().replace(/;\s*$/, '');
  const rows = await runAux(tabId, `SELECT count(*)::text AS count FROM (${inner}) AS pgt_q`);
  const count = String(rows[0]?.[0] ?? '?');
  patchRuntime(tabId, { exactCounts: { ...getRuntime(tabId).exactCounts, [statementIndex]: count } });
}

/** Switches the tab's database: closes the session and issues a fresh session id; text is kept. */
export async function switchDatabase(tabId: string, database: string): Promise<void> {
  const tab = queryTab(tabId);
  if (!tab || tab.params.database === database) return;
  const sess = sessions.get(tabId);
  sessions.delete(tabId);
  if (sess?.opened) await getApi()['session:close']({ sessionId: sess.sessionId }).catch(() => undefined);
  useStore.getState().updateParams<'query'>(tabId, { database, sessionId: crypto.randomUUID() });
  patchRuntime(tabId, { tx: { state: 'none', statements: 0, startedAt: null }, run: initialRunState, view: 0 });
}

/** Opens a new query tab pre-filled with `sql` and runs it immediately (used by confirm dialogs). */
export function runInNewTab(p: { connectionId: string; database: string; sql: string; name?: string }): string {
  const id = useStore.getState().openTab('query', { ...p, sessionId: crypto.randomUUID() }, { reuse: false, focus: true, ...(p.name ? { title: p.name } : {}) });
  void runQuery(id, p.sql, { mode: 'script' });
  return id;
}

/** Call once from the query tab so guards/cleanup exist even before the first run. */
export function ensureQueryRuntime(): void {
  ensureSubscribed();
}

/** Tab ids with a run in progress (for the tab bar spinner). */
export function runningTabIds(tabRuntime: Record<string, unknown>): string[] {
  return Object.entries(tabRuntime)
    .filter(([, v]) => Boolean((v as QueryTabRuntime | undefined)?.run?.running))
    .map(([k]) => k);
}
