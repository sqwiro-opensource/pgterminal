import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerOverview } from '@shared/types/stats';
import { getPgui } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { useTabRuntime } from '@renderer/tabs/useTab';
import { totalCommits, type TpsSample } from './overviewModel';

export type RefreshInterval = 5000 | 15000 | 30000 | 0;

export interface OverviewRuntime {
  overview: ServerOverview | null;
  prevSample: TpsSample | null;
  tps: number | null;
  loading: boolean;
  error: string | null;
  lastRefreshed: number | null;
  intervalMs: RefreshInterval;
}

const INIT: OverviewRuntime = { overview: null, prevSample: null, tps: null, loading: false, error: null, lastRefreshed: null, intervalMs: 15000 };

/** True while this tab is the one on screen (the only gate the first load needs). */
function isTabOnScreen(tabId: string): boolean {
  return useStore.getState().activeTabId === tabId;
}

/** True only while this tab is active, the document is visible and the window has focus. */
function shouldPoll(tabId: string): boolean {
  return isTabOnScreen(tabId) && document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * Polls `stats:overview` for one connection while the tab is the active, visible, focused one.
 * State lives in the tab runtime so switching tabs keeps the last snapshot.
 */
export function useOverviewPolling(tabId: string, connectionId: string): OverviewRuntime & { refresh(): Promise<void>; setInterval(ms: RefreshInterval): void } {
  const [rt, update] = useTabRuntime<OverviewRuntime>(tabId, INIT);
  const inflight = useRef(false);
  const connected = useStore((s) => s.status[connectionId]?.state === 'connected');

  const refresh = useCallback(async (): Promise<void> => {
    if (inflight.current) return;
    if (!useStore.getState().status[connectionId] || useStore.getState().status[connectionId]?.state !== 'connected') {
      update({ error: 'Not connected', loading: false });
      return;
    }
    inflight.current = true;
    update({ loading: true });
    try {
      const overview = await getPgui()['stats:overview']({ connectionId });
      const prev = (useStore.getState().tabRuntime[tabId] as OverviewRuntime | undefined)?.prevSample ?? null;
      const sample: TpsSample = { commits: totalCommits(overview.databases), at: overview.collectedAt };
      const dt = prev ? (sample.at - prev.at) / 1000 : 0;
      const dc = prev ? sample.commits - prev.commits : -1;
      const tps = prev && dt > 0 && dc >= 0 ? dc / dt : null;
      update({ overview, prevSample: sample, tps, loading: false, error: null, lastRefreshed: Date.now() });
    } catch (err) {
      update({ loading: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      inflight.current = false;
    }
  }, [connectionId, tabId, update]);

  const intervalMs = rt.intervalMs;
  useEffect(() => {
    if (!connected) return;
    if (!rt.overview && isTabOnScreen(tabId)) void refresh();
    if (intervalMs === 0) return;
    const tick = (): void => {
      if (shouldPoll(tabId)) void refresh();
    };
    const timer = window.setInterval(tick, intervalMs);
    const onVisible = (): void => {
      if (shouldPoll(tabId)) void refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, intervalMs, tabId, refresh]);

  const setInterval = useCallback((ms: RefreshInterval) => update({ intervalMs: ms }), [update]);
  return { ...rt, refresh, setInterval };
}

/** Re-renders every `ms` while mounted (for live durations); local state only. */
export function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
