import type { ServerOverview } from '@shared/types/stats';
import { formatBytes } from '@renderer/features/tree/treeModel';
import { Empty, Panel, Pill } from './parts';

export function ReplicationPanel({ overview, error, onRetry }: { overview: ServerOverview | null; error?: string; onRetry(): void }) {
  const repl = overview?.replication ?? [];
  return (
    <Panel title="Replication" count={overview ? repl.length : undefined} error={error} onRetry={onRetry}>
      {!overview ? (
        <Empty>Loading…</Empty>
      ) : overview.server.inRecovery ? (
        <div className="px-3 py-3 text-[12px]">
          <Pill tone="info">standby</Pill>
          <span className="ml-2 text-muted-foreground">This server is in recovery and replays WAL from its primary.</span>
        </div>
      ) : repl.length === 0 ? (
        <Empty>No streaming replicas connected</Empty>
      ) : (
        <ul className="divide-y divide-grid-line">
          {repl.map((r, i) => (
            <li key={`${r.client}-${i}`} className="flex h-8 items-center gap-2 px-3 text-[12px]">
              <span className="font-mono">{r.client ?? 'local'}</span>
              <Pill tone={r.state === 'streaming' ? 'ok' : 'warn'}>{r.state}</Pill>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-muted-foreground">sent {r.sentLsn} · replay {r.replayLsn}</span>
              <span className="font-mono text-[11px]">{r.lagBytes ? `lag ${formatBytes(r.lagBytes)}` : 'in sync'}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
