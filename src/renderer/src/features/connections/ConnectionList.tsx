import { Plus, Search, Import, Lock } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { ConnectionMeta } from '@shared/ipc';
import type { ConnectionStatus } from '../../store';
import { StatusDot } from './StatusDot';

export interface ConnectionListProps {
  connections: ConnectionMeta[];
  status: Record<string, ConnectionStatus>;
  selectedId: string | null;
  /** True when the form shows an unsaved new connection. */
  creating: boolean;
  onSelect(id: string | null): void;
  onNew(): void;
  onImportUri(): void;
}

function groupBy(list: ConnectionMeta[]): Array<[string, ConnectionMeta[]]> {
  const map = new Map<string, ConnectionMeta[]>();
  for (const c of list) {
    const g = c.group?.trim() || 'Ungrouped';
    const arr = map.get(g) ?? [];
    arr.push(c);
    map.set(g, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'Ungrouped' ? 1 : b === 'Ungrouped' ? -1 : a.localeCompare(b)))
    .map(([g, arr]) => [g, arr.sort((x, y) => x.name.localeCompare(y.name))]);
}

export function ConnectionList({ connections, status, selectedId, creating, onSelect, onNew, onImportUri }: ConnectionListProps): JSX.Element {
  return (
    <div className="flex h-full w-[260px] flex-none flex-col border-r border-border bg-sidebar">
      <div className="flex h-9 items-center gap-1 border-b border-border px-1.5">
        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[5px] border border-input bg-background px-2 text-[12px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Search size={14} strokeWidth={1.75} />
          <input className="min-w-0 flex-1 bg-transparent text-foreground outline-none" placeholder="Filter" />
        </label>
        <button type="button" onClick={onNew} title="New connection" className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-border bg-background px-2 text-[12px] font-medium hover:bg-accent">
          <Plus size={14} strokeWidth={2} /> New
        </button>
        <button type="button" onClick={onImportUri} title="Import from URI" className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-border bg-background px-2 text-[12px] hover:bg-accent">
          <Import size={14} strokeWidth={1.75} /> URI
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1 text-[13px]">
        {creating && (
          <div className="mx-1 flex h-7 items-center gap-2 rounded px-2 italic text-muted-foreground bg-accent">
            <StatusDot state="idle" /> New connection…
          </div>
        )}
        {connections.length === 0 && !creating && (
          <p className="mt-6 px-3 text-center text-[12px] text-muted-foreground">No saved connections</p>
        )}
        {groupBy(connections).map(([group, items]) => (
          <div key={group}>
            <div className="flex h-6 items-center px-2 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{group}</div>
            {items.map((c) => {
              const st = status[c.id]?.state ?? 'idle';
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'mx-1 flex h-7 w-[calc(100%-8px)] items-center gap-2 rounded px-2 text-left hover:bg-accent',
                    selectedId === c.id && 'bg-accent'
                  )}
                >
                  <StatusDot state={st} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.readOnly && <Lock size={12} strokeWidth={1.75} className="text-muted-foreground" />}
                  <span className={cn('env-badge', c.env)}>{c.env}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
