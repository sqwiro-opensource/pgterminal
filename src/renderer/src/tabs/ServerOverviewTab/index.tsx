import { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { Tab } from '@shared/types/workspace';
import { IconButton } from '@renderer/components/ui/IconButton';
import { formatUptime } from '@renderer/features/overview/overviewModel';
import { useOverviewPolling, type RefreshInterval } from '@renderer/features/overview/useOverviewPolling';
import { useStore } from '@renderer/store';
import { ActivityPanel, type KillContext } from './ActivityPanel';
import { DatabasesPanel } from './DatabasesPanel';
import { FleetView } from './FleetView';
import { KpiCards } from './KpiCards';
import { LocksPanel } from './LocksPanel';
import { ReplicationPanel } from './ReplicationPanel';
import { SlowQueriesPanel } from './SlowQueriesPanel';
import { TimescalePanel } from './TimescalePanel';
import { SkeletonLines } from './parts';
import { useRefreshSignal } from '@renderer/tabs/useTab';

export default function ServerOverviewTab({ tab: anyTab }: { tab: Tab }) {
  const tab = anyTab as Tab<'server-overview'>;
  if (tab.params.connectionId === 'all') return <FleetView tabId={tab.id} />;
  return <SingleServer tabId={tab.id} connectionId={tab.params.connectionId} />;
}

const INTERVALS: Array<{ v: RefreshInterval; label: string }> = [
  { v: 5000, label: '5 s' },
  { v: 15000, label: '15 s' },
  { v: 30000, label: '30 s' },
  { v: 0, label: 'off' }
];

function SingleServer({ tabId, connectionId }: { tabId: string; connectionId: string }) {
  const meta = useStore((s) => s.connections[connectionId]);
  const state = useStore((s) => s.status[connectionId]?.state ?? 'idle');
  const { overview, tps, loading, error, lastRefreshed, intervalMs, refresh, setInterval } = useOverviewPolling(tabId, connectionId);
  const [highlightPid, setHighlightPid] = useState<number | null>(null);
  const name = meta?.name ?? connectionId;
  const env = meta?.env ?? 'local';
  useRefreshSignal(tabId, () => void refresh());
  const ctx: KillContext = { connectionId, connectionName: name, env, refresh };
  const database = meta?.defaultDatabase ?? 'postgres';
  const errs = overview?.errors ?? {};
  const version = overview?.server.version.replace(/^PostgreSQL\s+/, '').split(' ')[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <span className={cn('inline-block h-2 w-2 rounded-full', state === 'connected' ? 'bg-success' : state === 'connecting' ? 'bg-warning animate-pulse2' : state === 'error' ? 'bg-destructive' : 'border-[1.5px] border-muted-foreground')} />
        <span className="text-[13px] font-medium">{name}</span>
        <span className={cn('env-badge', env)}>{env}</span>
        {overview && (
          <span className="text-[11.5px] text-muted-foreground">
            PostgreSQL {version} · up {formatUptime(overview.server.startedAt)}
            {meta && ` · ${meta.host}`}
          </span>
        )}
        <div className="flex-1" />
        {loading && overview && <span className="text-[11px] text-muted-foreground">refreshing…</span>}
        {lastRefreshed && <span className="text-[11px] text-muted-foreground">{new Date(lastRefreshed).toLocaleTimeString()}</span>}
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Auto-refresh
          <select value={intervalMs} onChange={(e) => setInterval(Number(e.target.value) as RefreshInterval)} className="h-6 rounded border border-input bg-background px-1 text-[11px] text-foreground">
            {INTERVALS.map((i) => (
              <option key={i.v} value={i.v}>{i.label}</option>
            ))}
          </select>
        </label>
        <IconButton label="Refresh now" size="sm" onClick={() => void refresh()} disabled={loading || state !== 'connected'}>
          <RefreshCw size={13} strokeWidth={1.75} className={loading ? 'animate-spin' : undefined} />
        </IconButton>
      </div>

      {loading && overview && <div className="h-px w-full bg-primary/60" />}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {state !== 'connected' ? (
          <div className="flex flex-col items-center gap-2 py-12 text-[12.5px] text-muted-foreground">
            <Activity size={18} strokeWidth={1.5} />
            <span>{name} is not connected.</span>
            <button type="button" onClick={() => void useStore.getState().connect(connectionId)} className="rounded border border-border px-2 py-1 text-foreground hover:bg-accent">Connect</button>
          </div>
        ) : error && !overview ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
            <button type="button" onClick={() => void refresh()} className="ml-3 underline">Retry</button>
          </div>
        ) : !overview ? (
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card"><SkeletonLines n={3} /></div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <KpiCards overview={overview} tps={tps} />
            {overview.timescale && <TimescalePanel timescale={overview.timescale} />}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <DatabasesPanel overview={overview} connectionId={connectionId} error={errs.databases} onRetry={() => void refresh()} />
              <ActivityPanel overview={overview} ctx={ctx} highlightPid={highlightPid} error={errs.activity} onRetry={() => void refresh()} />
              <LocksPanel overview={overview} ctx={ctx} onView={setHighlightPid} error={errs.locks} onRetry={() => void refresh()} />
              <SlowQueriesPanel overview={overview} ctx={ctx} database={database} error={errs.slowQueries} onRetry={() => void refresh()} />
              <ReplicationPanel overview={overview} error={errs.replication} onRetry={() => void refresh()} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
