import { useEffect } from 'react';
import { Database, Plus, Radar, Settings2 } from 'lucide-react';
import { useHistoryEntry } from '../features/history/HistoryDrawer';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { useStore } from '../store';
import { BINDINGS, displayKeys } from '../lib/keybindings';

/** Real bindings only, in the order the welcome screen should teach them. */
const WELCOME_BINDING_IDS = [
  'tab.new',
  'palette',
  'palette.tables',
  'palette.document',
  'editor.run',
  'editor.runSel',
  'tab.close',
  'tab.reopen',
  'view.sidebar',
  'view.inspector',
  'history',
  'shortcuts'
];

const SHORTCUTS: Array<[string, string]> = WELCOME_BINDING_IDS.flatMap((id) => {
  const b = BINDINGS.find((x) => x.id === id);
  return b ? [[b.label, displayKeys(b)] as [string, string]] : [];
});

export interface WelcomeScreenProps {
  onNewConnection?: () => void;
  onManageConnections?: () => void;
}

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  const m = Math.round(d / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function WelcomeScreen({ onNewConnection, onManageConnections }: WelcomeScreenProps): JSX.Element {
  const { recentQueries, historyLoaded, loadHistory, connections } = useStore(
    useShallow((s) => ({ recentQueries: s.history.slice(0, 5), historyLoaded: s.historyLoaded, loadHistory: s.loadHistory, connections: s.connections }))
  );
  const openHistoryEntry = useHistoryEntry();
  useEffect(() => {
    if (!historyLoaded) void loadHistory().catch(() => undefined);
  }, [historyLoaded, loadHistory]);
  const { recent, status, connect, openConnectionsView } = useStore(
    useShallow((s) => ({
      recent: Object.values(s.connections)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
      status: s.status,
      connect: s.connect,
      openConnectionsView: s.openConnectionsView
    }))
  );

  return (
    <div className="relative flex h-full w-full items-start justify-center overflow-auto bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:22px_22px]"
      />
      <div className="relative mt-[12vh] w-full max-w-[880px] px-8 pb-12 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Database size={20} strokeWidth={1.75} />
          </div>
          <div>
            <div className="font-mono text-[30px] font-bold leading-none tracking-tight">pgui</div>
            <div className="mt-1.5 text-[13px] text-muted-foreground">PostgreSQL workbench with document links</div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-[1fr_260px] gap-10">
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">Recent</h2>
            {recent.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                No connections yet. Add one to start browsing databases, or import a connection URI.
              </p>
            ) : (
              <ul className="space-y-1">
                {recent.map((c) => {
                  const st = status[c.id]?.state ?? 'idle';
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (st === 'connected') openConnectionsView(c.id);
                          else connect(c.id).catch((err: Error) => toast.error(`Could not connect to ${c.name}`, { description: err.message }));
                        }}
                        className="flex w-full items-center gap-2.5 rounded px-1.5 py-1 text-left text-[12.5px] hover:bg-accent"
                      >
                        <span
                          className={cn(
                            'inline-block h-2 w-2 rounded-full',
                            st === 'connected' && 'bg-success',
                            st === 'connecting' && 'bg-warning animate-pulse2',
                            st === 'error' && 'bg-destructive',
                            st === 'idle' && 'border-[1.5px] border-muted-foreground'
                          )}
                        />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">› {c.defaultDatabase}</span>
                        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={cn('env-badge', c.env)}>{c.env}</span>
                          {timeAgo(c.updatedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onNewConnection}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus size={14} strokeWidth={2} />
                New connection
              </button>
              <button
                type="button"
                onClick={onManageConnections}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Settings2 size={14} strokeWidth={1.75} />
                Manage connections
              </button>
              <button
                type="button"
                onClick={() => useStore.getState().openTab('server-overview', { connectionId: 'all' }, { title: 'Fleet' })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Radar size={14} strokeWidth={1.75} />
                Fleet overview
              </button>
            </div>

            <h2 className="mb-3 mt-10 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
              Recent queries
            </h2>
            {recentQueries.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Queries you run will appear here.</p>
            ) : (
              <ul className="space-y-1">
                {recentQueries.map((q) => (
                  <li key={q.id}>
                    <button type="button" onClick={() => openHistoryEntry(q, 'new')} className="flex w-full items-center gap-3 rounded px-1.5 py-1 text-left hover:bg-accent" title={q.sql}>
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{q.sql.replace(/\s+/g, ' ').trim()}</span>
                      <span className="flex-none text-[11px] text-muted-foreground">
                        {connections[q.connectionId]?.name ?? '?'} · {timeAgo(q.startedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">Shortcuts</h2>
            <ul className="space-y-[7px]">
              {SHORTCUTS.map(([label, keys]) => (
                <li key={label} className="flex items-center justify-between text-[12.5px]">
                  <span>{label}</span>
                  <span className="kbd">{keys}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
