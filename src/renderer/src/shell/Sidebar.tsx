import { Plus, Radar, Search, Settings2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { CatalogTree } from '@renderer/features/tree/CatalogTree';
import { useStore } from '../store';

export interface SidebarProps {
  onNewConnection: () => void;
  onManage: () => void;
  onEditConnection: (id: string) => void;
}

export function Sidebar({ onNewConnection, onManage, onEditConnection }: SidebarProps): JSX.Element {
  const { filter, setFilter } = useStore(useShallow((s) => ({ filter: s.sidebarFilter, setFilter: s.setSidebarFilter })));
  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar">
      <label className="m-1.5 flex h-7 items-center gap-1.5 rounded-[5px] border border-input bg-background px-2 text-[12px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search size={14} strokeWidth={1.75} className="flex-none" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setFilter('');
          }}
          placeholder="Filter connections & objects"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {filter ? (
          <button type="button" aria-label="Clear filter" onClick={() => setFilter('')} className="hover:text-foreground">
            <X size={12} strokeWidth={2} />
          </button>
        ) : (
          <span className="kbd">⌘⇧F</span>
        )}
      </label>

      <div className="min-h-0 flex-1">
        <CatalogTree onEditConnection={onEditConnection} onNewConnection={onNewConnection} />
      </div>

      <div className="flex h-8 items-center justify-between border-t border-border px-2 text-[12px]">
        <button type="button" onClick={onNewConnection} className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent">
          <Plus size={14} strokeWidth={1.75} />
          New connection
        </button>
        <button
          type="button"
          title="Fleet overview"
          onClick={() => useStore.getState().openTab('server-overview', { connectionId: 'all' }, { title: 'Fleet' })}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
        >
          <Radar size={14} strokeWidth={1.75} />
          Fleet
        </button>
        <button type="button" onClick={onManage} className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent">
          <Settings2 size={14} strokeWidth={1.75} />
          Manage
        </button>
      </div>
    </aside>
  );
}
