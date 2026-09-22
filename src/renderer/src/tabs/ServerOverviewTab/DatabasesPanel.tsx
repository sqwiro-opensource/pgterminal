import { useState } from 'react';
import { SquareTerminal } from 'lucide-react';
import type { ServerOverview } from '@shared/types/stats';
import { nodeIds } from '@shared/catalog/nodeId';
import { formatBytes } from '@renderer/features/tree/treeModel';
import { barPercent, maxSize } from '@renderer/features/overview/overviewModel';
import { openQueryTab } from '@renderer/features/tree/actions';
import { nodeKey } from '@renderer/store/catalog.slice';
import { useStore } from '@renderer/store';
import { Empty, Panel } from './parts';

export function DatabasesPanel({ overview, connectionId, error, onRetry }: { overview: ServerOverview | null; connectionId: string; error?: string; onRetry(): void }) {
  const [filter, setFilter] = useState('');
  const dbs = (overview?.databases ?? []).filter((d) => !filter || d.name.toLowerCase().includes(filter.toLowerCase()));
  const max = maxSize(overview?.databases ?? []);
  const reveal = (name: string): void => {
    const s = useStore.getState();
    s.openDatabase(connectionId, name);
    s.toggleExpanded(nodeKey(connectionId, 'server'), true);
    s.toggleExpanded(nodeKey(connectionId, nodeIds.database(name)), true);
    s.setSidebarCollapsed(false);
  };
  return (
    <Panel
      title="Databases"
      count={overview?.databases.length}
      error={error}
      onRetry={onRetry}
      right={
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter"
          className="h-5 w-24 rounded border border-input bg-background px-1.5 text-[11px] outline-none focus:ring-2 focus:ring-ring"
        />
      }
    >
      {dbs.length === 0 ? (
        <Empty>{overview ? 'No databases' : 'Loading…'}</Empty>
      ) : (
        <ul className="divide-y divide-grid-line">
          {dbs.map((d) => (
            <li key={d.name} className="group flex h-7 items-center gap-2 px-3 text-[12.5px] hover:bg-accent">
              <button type="button" onClick={() => reveal(d.name)} className="w-36 truncate text-left font-medium hover:underline" title="Reveal in tree">
                {d.name}
              </button>
              <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                <div className="h-full rounded bg-primary/70" style={{ width: `${barPercent(d.sizeBytes, max)}%` }} />
              </div>
              <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">{formatBytes(d.sizeBytes)}</span>
              <span className="w-8 text-right font-mono text-[11px] text-muted-foreground" title="backends">{d.backends}</span>
              <button
                type="button"
                title="New query"
                onClick={() => openQueryTab({ connectionId, database: d.name, sql: '' })}
                className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
              >
                <SquareTerminal size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
