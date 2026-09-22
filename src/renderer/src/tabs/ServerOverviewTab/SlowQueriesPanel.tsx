import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { ServerOverview } from '@shared/types/stats';
import { confirm } from '@renderer/components/ui/ConfirmDialog';
import { openQueryTab } from '@renderer/features/tree/actions';
import type { KillContext } from './ActivityPanel';
import { Empty, Panel } from './parts';

export function SlowQueriesPanel({ overview, ctx, database, error, onRetry }: { overview: ServerOverview | null; ctx: KillContext; database: string; error?: string; onRetry(): void }) {
  const [by, setBy] = useState<'byMean' | 'byTotal'>('byMean');
  const sq = overview?.slowQueries ?? null;
  const rows = sq ? sq[by] : [];
  const resetStats = (): void =>
    confirm({
      title: 'Reset pg_stat_statements',
      verb: 'Open in editor',
      variant: 'neutral',
      env: ctx.env,
      connectionName: ctx.connectionName,
      summary: 'Clears every collected statement statistic on this server. The statement is opened in a query tab for you to run.',
      buildSql: () => 'SELECT pg_stat_statements_reset();',
      onConfirm: (sql) => {
        openQueryTab({ connectionId: ctx.connectionId, database, sql, name: 'Reset stats' });
        toast.info('Run the statement in the opened query tab');
      }
    });
  return (
    <Panel
      title="Slow queries"
      count={sq ? rows.length : undefined}
      error={error}
      onRetry={onRetry}
      right={
        sq ? (
          <>
            <div className="flex overflow-hidden rounded border border-border text-[11px]">
              {(['byMean', 'byTotal'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setBy(k)} className={cn('px-2 py-0.5', by === k ? 'bg-accent text-foreground' : 'text-muted-foreground')}>
                  {k === 'byMean' ? 'by mean' : 'by total'}
                </button>
              ))}
            </div>
            <button type="button" title="Reset statistics" onClick={resetStats} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <RotateCcw size={13} strokeWidth={1.75} />
            </button>
          </>
        ) : null
      }
    >
      {!overview ? (
        <Empty>Loading…</Empty>
      ) : !sq ? (
        <div className="px-3 py-3 text-[12px]">
          <p className="font-medium">pg_stat_statements is not available</p>
          <p className="mt-1 text-muted-foreground">{overview.slowQueriesHint ?? 'Enable the extension to see slow queries.'}</p>
          <pre className="mt-2 rounded border border-border bg-background p-2 font-mono text-[11.5px]">{'-- postgresql.conf: shared_preload_libraries = \'pg_stat_statements\'\nCREATE EXTENSION IF NOT EXISTS pg_stat_statements;'}</pre>
        </div>
      ) : rows.length === 0 ? (
        <Empty>No statistics collected yet</Empty>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-grid-header text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-right font-medium">mean ms</th>
              <th className="px-2 py-1 text-right font-medium">total s</th>
              <th className="px-2 py-1 text-right font-medium">calls</th>
              <th className="px-2 py-1 font-medium">query</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((q, i) => (
              <tr key={`${q.queryId}-${i}`} className="group h-7 border-t border-grid-line hover:bg-accent">
                <td className="px-2 text-right font-mono text-num">{q.meanMs >= 100 ? Math.round(q.meanMs).toLocaleString() : q.meanMs.toFixed(1)}</td>
                <td className="px-2 text-right font-mono text-muted-foreground">{(q.totalMs / 1000).toFixed(1)}</td>
                <td className="px-2 text-right font-mono text-muted-foreground">{Number(q.calls).toLocaleString()}</td>
                <td className="max-w-[420px] truncate px-2 font-mono text-[11.5px]" title={q.query}>{q.query}</td>
                <td className="whitespace-nowrap px-2 text-right">
                  <button type="button" onClick={() => openQueryTab({ connectionId: ctx.connectionId, database, sql: `EXPLAIN (ANALYZE false)\n${q.query}`, name: 'Explain' })} className="invisible rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-background group-hover:visible">Explain</button>
                  <button type="button" onClick={() => openQueryTab({ connectionId: ctx.connectionId, database, sql: q.query })} className="invisible ml-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-background group-hover:visible">Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
