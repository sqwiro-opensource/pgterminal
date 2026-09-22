import { useEffect, useRef } from 'react';
import { Server } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { ServerOverview } from '@shared/types/stats';
import type { ConnectionMeta } from '@shared/types/connection';
import { getPgui } from '@renderer/lib/ipc';
import { formatBytes } from '@renderer/features/tree/treeModel';
import { cacheHitPercent, formatUptime, sessionsSummary, totalSize } from '@renderer/features/overview/overviewModel';
import { useStore } from '@renderer/store';
import { useTabRuntime } from '@renderer/tabs/useTab';
import { Pill } from './parts';

interface FleetEntry {
  overview?: ServerOverview;
  error?: string;
  at?: number;
}
interface FleetRuntime {
  entries: Record<string, FleetEntry>;
  intervalMs: number;
}

/** One card per saved connection, grouped; connected servers are polled one after another, never in parallel. */
export function FleetView({ tabId }: { tabId: string }) {
  const { connections, status, connect, openTab } = useStore(
    useShallow((s) => ({ connections: s.connections, status: s.status, connect: s.connect, openTab: s.openTab }))
  );
  const [rt, update] = useTabRuntime<FleetRuntime>(tabId, { entries: {}, intervalMs: 15000 });
  const busy = useRef(false);
  const connectedIds = Object.values(connections)
    .filter((c) => status[c.id]?.state === 'connected')
    .map((c) => c.id)
    .join(',');

  useEffect(() => {
    let cancelled = false;
    const poll = async (): Promise<void> => {
      if (busy.current || cancelled) return;
      if (useStore.getState().activeTabId !== tabId || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        for (const id of connectedIds.split(',').filter(Boolean)) {
          if (cancelled) break;
          try {
            const overview = await getPgui()['stats:overview']({ connectionId: id });
            const cur = (useStore.getState().tabRuntime[tabId] as FleetRuntime | undefined)?.entries ?? {};
            update({ entries: { ...cur, [id]: { overview, at: Date.now() } } });
          } catch (err) {
            const cur = (useStore.getState().tabRuntime[tabId] as FleetRuntime | undefined)?.entries ?? {};
            update({ entries: { ...cur, [id]: { ...cur[id], error: err instanceof Error ? err.message : String(err), at: Date.now() } } });
          }
        }
      } finally {
        busy.current = false;
      }
    };
    void poll();
    const t = window.setInterval(() => void poll(), rt.intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [connectedIds, rt.intervalMs, tabId, update]);

  const groups = new Map<string, ConnectionMeta[]>();
  for (const c of Object.values(connections).sort((a, b) => a.name.localeCompare(b.name))) {
    const g = c.group?.trim() || 'Ungrouped';
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <Server size={14} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="text-[13px] font-medium">Fleet overview</span>
        <span className="text-[11px] text-muted-foreground">{Object.keys(connections).length} servers · {connectedIds ? connectedIds.split(',').length : 0} connected</span>
        <div className="flex-1" />
        <select value={rt.intervalMs} onChange={(e) => update({ intervalMs: Number(e.target.value) })} className="h-6 rounded border border-input bg-background px-1 text-[11px]">
          <option value={5000}>5 s</option>
          <option value={15000}>15 s</option>
          <option value={30000}>30 s</option>
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {groups.size === 0 && <p className="text-[12px] text-muted-foreground">No connections yet.</p>}
        {[...groups.entries()].map(([g, list]) => (
          <section key={g} className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{g}</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => {
                const st = status[c.id]?.state ?? 'idle';
                const e = rt.entries[c.id];
                const o = e?.overview;
                const s = o ? sessionsSummary(o.activity) : null;
                const hit = o ? cacheHitPercent(o.databases) : null;
                return (
                  <div key={c.id} className={cn('rounded-lg border border-border bg-card p-3', c.env === 'prod' && 'border-t-2 border-t-env-prod-bar')}>
                    <div className="flex items-center gap-2">
                      <span className={cn('inline-block h-2 w-2 rounded-full', st === 'connected' ? 'bg-success' : st === 'connecting' ? 'bg-warning animate-pulse2' : st === 'error' ? 'bg-destructive' : 'border-[1.5px] border-muted-foreground')} />
                      <button type="button" onClick={() => openTab('server-overview', { connectionId: c.id }, { title: c.name })} className="truncate text-[13px] font-medium hover:underline" disabled={st !== 'connected'}>
                        {c.name}
                      </button>
                      <span className={cn('env-badge', c.env)}>{c.env}</span>
                      <div className="flex-1" />
                      {st !== 'connected' && (
                        <button type="button" onClick={() => void connect(c.id)} disabled={st === 'connecting'} className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50">
                          {st === 'connecting' ? 'Connecting…' : 'Connect'}
                        </button>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">{c.host}:{c.port}</div>
                    {st === 'connected' && !o && !e?.error && <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />}
                    {e?.error && <div className="mt-2 text-[11px] text-destructive">{e.error}</div>}
                    {o && s && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                        <dt className="text-muted-foreground">Version</dt><dd className="font-mono">{o.server.version.replace(/^PostgreSQL\s+/, '').split(' ')[0]}</dd>
                        <dt className="text-muted-foreground">Uptime</dt><dd className="font-mono">{formatUptime(o.server.startedAt)}</dd>
                        <dt className="text-muted-foreground">Sessions</dt><dd className="font-mono">{s.total} / {o.server.maxConnections} <span className="text-muted-foreground">({s.active} active)</span></dd>
                        <dt className="text-muted-foreground">Size</dt><dd className="font-mono">{formatBytes(totalSize(o.databases))} · {o.databases.length} dbs</dd>
                        <dt className="text-muted-foreground">Cache hit</dt><dd className="font-mono">{hit === null ? '—' : `${hit.toFixed(1)} %`}</dd>
                        <dt className="text-muted-foreground">Replication</dt>
                        <dd>{o.server.inRecovery ? <Pill tone="info">standby</Pill> : o.replication.length ? <Pill tone="ok">{o.replication.length} standby</Pill> : <span className="text-muted-foreground">none</span>}</dd>
                        {o.timescale && (<><dt className="text-muted-foreground">Timescale</dt><dd className="font-mono">{o.timescale.hypertables} hypertables</dd></>)}
                        {s.waiting > 0 && (<><dt className="text-muted-foreground">Blocked</dt><dd><Pill tone="warn">{s.waiting}</Pill></dd></>)}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
