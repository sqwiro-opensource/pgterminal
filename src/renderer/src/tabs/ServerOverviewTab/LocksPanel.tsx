import type { ServerOverview } from '@shared/types/stats';
import { blockingChains } from '@renderer/features/overview/overviewModel';
import { killBackend, type KillContext } from './ActivityPanel';
import { Empty, Panel, Pill } from './parts';

export function LocksPanel({ overview, ctx, onView, error, onRetry }: { overview: ServerOverview | null; ctx: KillContext; onView(pid: number): void; error?: string; onRetry(): void }) {
  const chains = overview ? blockingChains(overview.activity, overview.locks) : [];
  return (
    <Panel title="Locks & blocking" count={overview ? chains.length : undefined} error={error} onRetry={onRetry}>
      {chains.length === 0 ? (
        <Empty>{overview ? 'No blocked sessions' : 'Loading…'}</Empty>
      ) : (
        <ul className="divide-y divide-grid-line">
          {chains.map((c) => (
            <li key={`${c.blocked}-${c.blocker}`} className="flex h-8 items-center gap-2 px-3 text-[12px]">
              <Pill tone="warn">{c.blocked}</Pill>
              <span className="text-muted-foreground">←</span>
              <Pill tone="bad">{c.blocker}</Pill>
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground" title={c.relation ?? undefined}>
                {c.relation ? `holds ${c.relation}` : 'holds a lock'}{c.mode ? ` (${c.mode})` : ''}
              </span>
              <button type="button" onClick={() => onView(c.blocker)} className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-accent">View</button>
              <button type="button" onClick={() => killBackend(ctx, c.blocker, true)} className="rounded border border-destructive/50 px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10">Terminate</button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
