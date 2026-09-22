import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppInfo } from '@shared/ipc';
import { getPgui } from '../lib/ipc';
import { activeConnectionId, useStore } from '../store';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { reconnectNow } from '../features/connections/useReconnect';
import { commitTx, rollbackTx, type QueryTabRuntime } from '../tabs/QueryTab/runManager';

export function StatusBar(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { connectedCount, active, activeDb, queryTabId, q, degraded } = useStore(
    useShallow((s) => {
      const cid = activeConnectionId(s);
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const rt = tab?.kind === 'query' ? (s.tabRuntime[tab.id] as QueryTabRuntime | undefined) : undefined;
      return {
        queryTabId: tab?.kind === 'query' ? tab.id : null,
        q: rt
          ? { tx: rt.tx.state, txStatements: rt.tx.statements, txStartedAt: rt.tx.startedAt, running: rt.run.running, rows: rt.lastRowCount, ms: rt.lastDurationMs, line: rt.cursor.line, col: rt.cursor.col, readOnly: false }
          : null,
        connectedCount: Object.values(s.status).filter((st) => st.state === 'connected').length,
        degraded: Object.entries(s.status)
          .filter(([, st]) => st.degraded)
          .map(([id, st]) => ({ id, name: s.connections[id]?.name ?? id, reconnecting: !!st.reconnecting }))[0],
        active: cid ? s.connections[cid] : undefined,
        activeDb: (tab?.params as { database?: string } | undefined)?.database
      };
    })
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const i = await getPgui()['app:info']();
        if (!cancelled) setInfo(i);
      } catch (err) {
        console.warn('app:info unavailable', (err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="flex h-6 items-center gap-3.5 border-t border-border bg-statusbar px-2.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 text-foreground">
        {active ? (
          <>
            <span className={cn('inline-block h-2 w-2 rounded-full', connectedCount > 0 ? 'bg-success' : 'border-[1.5px] border-muted-foreground')} />
            <span className="font-mono">{active.name}</span>
            <span className={cn('env-badge', active.env)}>{active.env}</span>
            {activeDb && <span className="text-muted-foreground">{activeDb}</span>}
          </>
        ) : connectedCount > 0 ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
            {connectedCount} connected
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 rounded-full border-[1.5px] border-muted-foreground" />
            <span className="text-muted-foreground">Not connected</span>
          </>
        )}
      </span>
      {queryTabId && q && q.tx !== 'none' && (
        <span className={cn('inline-flex h-[18px] items-center gap-2 rounded px-2', q.tx === 'aborted' ? 'bg-destructive/15 text-destructive' : 'bg-env-staging-bg text-env-staging-fg')}>
          {q.tx === 'aborted' ? 'TX aborted — rollback required' : `TX open · ${q.txStatements} stmt${q.txStatements === 1 ? '' : 's'}`}
          {q.tx === 'open' && (
            <button type="button" className="font-semibold underline" onClick={() => void commitTx(queryTabId).catch((e: Error) => toast.error('Commit failed', { description: e.message }))}>
              Commit
            </button>
          )}
          <button type="button" className="font-semibold underline" onClick={() => void rollbackTx(queryTabId).catch((e: Error) => toast.error('Rollback failed', { description: e.message }))}>
            Rollback
          </button>
        </span>
      )}
      {queryTabId && q?.tx === 'none' && <span>Autocommit</span>}
      {degraded && (
        <span className="inline-flex h-[18px] items-center gap-1.5 rounded bg-env-staging-bg px-2 text-env-staging-fg">
          <TriangleAlert size={12} strokeWidth={1.75} />
          {degraded.reconnecting ? `Reconnecting to ${degraded.name}…` : `${degraded.name} connection lost`}
          {!degraded.reconnecting && (
            <button type="button" className="font-semibold underline" onClick={() => reconnectNow(degraded.id)}>
              Reconnect
            </button>
          )}
        </span>
      )}
      <span className="flex-1 text-center" />
      {queryTabId && q && (
        <span className="flex items-center gap-3.5 font-mono">
          {q.running && <span className="text-primary">running…</span>}
          {q.rows !== null && <span>{q.rows.toLocaleString()} rows</span>}
          {q.ms !== null && <span>{q.ms} ms</span>}
          <span>
            Ln {q.line}, Col {q.col}
          </span>
        </span>
      )}
      {info && (
        <span className="font-mono">
          pgui {info.version} · Electron {info.electron}
        </span>
      )}
    </footer>
  );
}
