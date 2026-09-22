import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { ServerOverview } from '@shared/types/stats';
import type { EnvLabel } from '@shared/types/connection';
import { confirm } from '@renderer/components/ui/ConfirmDialog';
import { getApi } from '@renderer/lib/ipc';
import { formatDuration, sessionSecondary, sortActivity } from '@renderer/features/overview/overviewModel';
import { useTick } from '@renderer/features/overview/useOverviewPolling';
import { useStore } from '@renderer/store';
import { Empty, Panel, Pill, stateTone } from './parts';

type Activity = ServerOverview['activity'][number];

export interface KillContext {
  connectionId: string;
  connectionName: string;
  env: EnvLabel;
  refresh(): Promise<void>;
}

/** Cancel (light) or terminate (destructive, typed pid on prod) a backend through the shared confirm dialog. */
export function killBackend(ctx: KillContext, pid: number, terminate: boolean): void {
  const typed = useStore.getState().settings.typedConfirmOnProd && ctx.env === 'prod' && terminate;
  confirm({
    title: `${terminate ? 'Terminate' : 'Cancel'} backend ${pid}`,
    verb: terminate ? 'Terminate' : 'Cancel query',
    variant: terminate ? 'destructive' : 'light',
    env: ctx.env,
    connectionName: ctx.connectionName,
    summary: terminate
      ? `Disconnects backend ${pid} immediately; its transaction is rolled back and the client sees a dropped connection.`
      : `Asks backend ${pid} to abort its current statement; the session stays open.`,
    buildSql: () => `SELECT ${terminate ? 'pg_terminate_backend' : 'pg_cancel_backend'}(${pid});`,
    ...(typed ? { typedName: String(pid) } : {}),
    onConfirm: async () => {
      const r = await getApi()['stats:cancelBackend']({ connectionId: ctx.connectionId, pid, terminate });
      if (!r.ok) throw new Error(`Backend ${pid} did not acknowledge the ${terminate ? 'terminate' : 'cancel'} request`);
      toast.success(`${terminate ? 'Terminated' : 'Cancelled'} backend ${pid}`);
      await ctx.refresh();
    }
  });
}

export function ActivityPanel({ overview, ctx, highlightPid, error, onRetry }: { overview: ServerOverview | null; ctx: KillContext; highlightPid: number | null; error?: string; onRetry(): void }) {
  const [showIdle, setShowIdle] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const now = useTick(1000);
  const rows = sortActivity(overview?.activity ?? [], showIdle);
  const drift = overview ? now - overview.collectedAt : 0;
  const live = (a: Activity): number | null => (a.durationMs === null ? null : a.state === 'active' ? a.durationMs + drift : a.durationMs);
  return (
    <Panel
      title="Active sessions"
      count={overview ? `${rows.length} of ${overview.activity.length}` : undefined}
      error={error}
      onRetry={onRetry}
      right={
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} /> show idle
        </label>
      }
    >
      {rows.length === 0 ? (
        <Empty>{overview ? 'No sessions' : 'Loading…'}</Empty>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-grid-header text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">pid</th>
              <th className="px-2 py-1 font-medium">user</th>
              <th className="px-2 py-1 font-medium">db</th>
              <th className="px-2 py-1 font-medium">state</th>
              <th className="px-2 py-1 font-medium">wait</th>
              <th className="px-2 py-1 text-right font-medium">dur</th>
              <th className="px-2 py-1 font-medium">query</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const isOpen = open === a.pid;
              return [
                <tr
                  key={a.pid}
                  onClick={() => setOpen(isOpen ? null : a.pid)}
                  className={cn('h-7 cursor-pointer border-t border-grid-line hover:bg-accent', highlightPid === a.pid && 'bg-primary/10', a.blockedBy.length > 0 && 'bg-warning/10')}
                >
                  <td className="px-2 font-mono">{a.pid}{a.isOwn && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}</td>
                  <td className="px-2">{a.user}</td>
                  <td className="px-2">{a.database}</td>
                  <td className="px-2"><Pill tone={stateTone(a.state)}>{a.state ?? '—'}</Pill></td>
                  <td className="px-2 text-muted-foreground">{a.waitEventType ?? '—'}</td>
                  <td className="px-2 text-right font-mono text-muted-foreground">{formatDuration(live(a))}</td>
                  <td className="max-w-[360px] truncate px-2 font-mono text-[11.5px]" title={a.query}>{a.query || <span className="text-muted-foreground">—</span>}</td>
                </tr>,
                isOpen && (
                  <tr key={`${a.pid}-x`} className="border-t border-grid-line bg-muted/40">
                    <td colSpan={7} className="px-3 py-2">
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11.5px]">{a.query || '(no query)'}</pre>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{sessionSecondary(a) || 'no client info'}</span>
                        {a.xactStart && <span>xact {formatDuration(now - Date.parse(a.xactStart))}</span>}
                        {a.blockedBy.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            blocked by {a.blockedBy.map((p) => <Pill key={p} tone="warn">{p}</Pill>)}
                          </span>
                        )}
                        <div className="flex-1" />
                        <button type="button" disabled={a.isOwn} onClick={() => killBackend(ctx, a.pid, false)} className="rounded border border-border px-2 py-0.5 text-foreground hover:bg-accent disabled:opacity-40">Cancel</button>
                        <button type="button" disabled={a.isOwn} onClick={() => killBackend(ctx, a.pid, true)} className="rounded border border-destructive/50 px-2 py-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-40">Terminate</button>
                      </div>
                    </td>
                  </tr>
                )
              ];
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
