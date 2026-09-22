import type { CellPos } from './useGridSelection';

export interface GridSessionState {
  selected: number[];
  anchor: number | null;
  focus: CellPos | null;
  scrollTop: number;
  scrollLeft: number;
}

/**
 * Where a grid was left: selection, focused cell and scroll offset.
 *
 * Only the active tab is mounted, so switching tabs unmounts the grid and its local state goes
 * with it. This keeps that state for the session, keyed per grid, so following a document link
 * and coming back leaves you where you were. It is deliberately in memory only — a selection
 * is not worth restoring after a restart, when the rows underneath may have changed.
 */
const STATE = new Map<string, GridSessionState>();
const LIMIT = 50;

export function readGridState(key: string | undefined): GridSessionState | undefined {
  return key ? STATE.get(key) : undefined;
}

export function writeGridState(key: string | undefined, patch: Partial<GridSessionState>): void {
  if (!key) return;
  const prev = STATE.get(key) ?? { selected: [], anchor: null, focus: null, scrollTop: 0, scrollLeft: 0 };
  STATE.set(key, { ...prev, ...patch });
  // Bound the map so long sessions with many tabs cannot grow it without limit.
  if (STATE.size > LIMIT) {
    const oldest = STATE.keys().next().value;
    if (oldest !== undefined && oldest !== key) STATE.delete(oldest);
  }
}

export function clearGridState(key: string | undefined): void {
  if (key) STATE.delete(key);
}
