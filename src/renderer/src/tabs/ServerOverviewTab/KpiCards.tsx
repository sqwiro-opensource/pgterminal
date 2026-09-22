import type { ServerOverview } from '@shared/types/stats';
import { formatBytes } from '@renderer/features/tree/treeModel';
import { cacheHitPercent, sessionsSummary, totalSize } from '@renderer/features/overview/overviewModel';
import { Kpi } from './parts';

export function KpiCards({ overview, tps }: { overview: ServerOverview; tps: number | null }) {
  const s = sessionsSummary(overview.activity);
  const hit = cacheHitPercent(overview.databases);
  const max = overview.server.maxConnections;
  const usage = max > 0 ? (s.total / max) * 100 : null;
  const rollbacks = overview.databases.reduce((n, d) => n + (Number(d.xactRollback) || 0), 0);
  const commits = overview.databases.reduce((n, d) => n + (Number(d.xactCommit) || 0), 0);
  const commitRatio = commits + rollbacks > 0 ? (commits / (commits + rollbacks)) * 100 : null;
  const deadlocks = overview.databases.reduce((n, d) => n + (Number(d.deadlocks) || 0), 0);
  const repl = overview.replication;
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <Kpi
        label="Sessions"
        value={
          <>
            {s.total}
            <span className="text-[13px] font-normal text-muted-foreground"> / {max || '—'}</span>
          </>
        }
        sub={`${s.active} active · ${s.idle} idle${s.idleInTx ? ` · ${s.idleInTx} idle in tx` : ''}${s.waiting ? ` · ${s.waiting} waiting` : ''}`}
        percent={usage}
        tone={usage !== null && usage > 85 ? 'bad' : usage !== null && usage > 60 ? 'warn' : 'default'}
      />
      <Kpi
        label="Transactions / s"
        value={tps === null ? '—' : tps >= 100 ? Math.round(tps).toLocaleString() : tps.toFixed(1)}
        sub={commitRatio === null ? 'no samples yet' : `commits ${commitRatio.toFixed(1)} % · ${deadlocks} deadlocks`}
      />
      <Kpi
        label="Cache hit"
        value={hit === null ? '—' : `${hit.toFixed(1)} %`}
        percent={hit}
        tone={hit !== null && hit < 90 ? 'bad' : hit !== null && hit < 97 ? 'warn' : 'ok'}
        sub={`${formatBytes(totalSize(overview.databases))} total · ${overview.databases.length} databases`}
      />
      <Kpi
        label="WAL / Replication"
        value={overview.server.inRecovery ? 'Standby' : repl.length ? `${repl.length} standby${repl.length > 1 ? 's' : ''}` : 'Primary'}
        sub={
          overview.server.inRecovery
            ? 'in recovery · replaying WAL'
            : repl.length
              ? repl.map((r) => `${r.state}${r.lagBytes ? ` · lag ${formatBytes(r.lagBytes)}` : ''}`).join(', ')
              : 'no streaming replicas'
        }
      />
    </div>
  );
}
