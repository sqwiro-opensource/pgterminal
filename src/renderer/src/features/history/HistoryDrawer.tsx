import { useEffect } from 'react';
import { History, Search, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { HistoryEntry } from '@shared/ipc';
import { useStore } from '@renderer/store';

function relTime(ts: number): string {
  const d = Date.now() - ts;
  const s = Math.round(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Opens a new query tab pre-filled with the entry's SQL, or appends to the active query tab. */
export function useHistoryEntry(): (e: HistoryEntry, mode: 'append' | 'new') => void {
  return (e, mode) => {
    const s = useStore.getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    if (mode === 'append' && active && active.kind === 'query') {
      const p = (active as { params: { sql: string } }).params;
      s.updateParams<'query'>(active.id, { sql: p.sql ? `${p.sql.replace(/\s*$/, '')}\n\n${e.sql}` : e.sql });
      return;
    }
    s.openTab('query', { connectionId: e.connectionId, database: e.database, sessionId: crypto.randomUUID(), sql: e.sql }, { reuse: false });
    s.toggleHistory(false);
  };
}

export function HistoryDrawer(): JSX.Element | null {
  const { open, entries, search, connections, setSearch, load, clear, toggle } = useStore(
    useShallow((s) => ({
      open: s.historyOpen,
      entries: s.history,
      search: s.historySearch,
      connections: s.connections,
      setSearch: s.setHistorySearch,
      load: s.loadHistory,
      clear: s.clearHistory,
      toggle: s.toggleHistory
    }))
  );
  const use = useHistoryEntry();
  const activeConn = useStore((s) => {
    const t = s.tabs.find((x) => x.id === s.activeTabId);
    return (t?.params as { connectionId?: string } | undefined)?.connectionId;
  });

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load().catch(() => undefined), 200);
    return () => clearTimeout(t);
  }, [open, search, load]);

  if (!open) return null;
  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-[440px] max-w-full flex-col border-l border-border bg-popover shadow-xl animate-in slide-in-from-right-4 duration-200">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-border px-3 text-[12.5px] font-semibold">
        <History size={14} strokeWidth={1.75} className="text-muted-foreground" /> Query history
        <span className="text-[11px] font-normal text-muted-foreground">{entries.length}</span>
        <span className="flex-1" />
        {activeConn && (
          <button type="button" onClick={() => void clear(activeConn)} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11.5px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground" title="Clear history for the active connection">
            <Trash2 size={12} strokeWidth={1.75} /> Clear for this connection
          </button>
        )}
        <button type="button" aria-label="Close" onClick={() => toggle(false)} className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent">
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
      <label className="m-2 flex h-7 flex-none items-center gap-1.5 rounded border border-input bg-background px-2 text-[12px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search size={13} strokeWidth={1.75} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SQL…" className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
      </label>
      <ul className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 && <li className="p-4 text-center text-[12.5px] text-muted-foreground">No history yet.</li>}
        {entries.map((e) => {
          const c = connections[e.connectionId];
          return (
            <li key={e.id} className="border-b border-grid-line">
              <button type="button" onClick={(ev) => use(e, ev.metaKey || ev.ctrlKey ? 'new' : 'append')} onDoubleClick={() => use(e, 'new')} className="block w-full px-3 py-2 text-left hover:bg-accent" title="Click: append to the active query tab · ⌘-click/double-click: open in a new tab">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{c?.name ?? e.connectionId.slice(0, 8)}</span>
                  <span>{e.database}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[10px] font-semibold uppercase',
                      e.status === 'ok' && 'bg-success/15 text-success',
                      e.status === 'error' && 'bg-destructive/15 text-destructive',
                      e.status === 'cancelled' && 'bg-warning/20 text-warning'
                    )}
                  >
                    {e.status === 'error' && e.errorCode ? `error ${e.errorCode}` : e.status}
                  </span>
                  <span className="ml-auto font-mono">{e.durationMs} ms</span>
                  <span>{relTime(e.startedAt)}</span>
                </div>
                <pre className="mt-1 line-clamp-2 whitespace-pre-wrap font-mono text-[11.5px] leading-snug text-foreground/90">{e.sql.trim()}</pre>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
