import {
  Activity,
  Braces,
  ChevronDown,
  Code2,
  Columns3,
  FileCode2,
  LoaderCircle,
  Plug,
  Plus,
  Settings,
  SquareFunction,
  Table2,
  X,
  type LucideIcon
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@cloudhub-ux/shadcn/esm/components/ui/dropdown-menu';
import type { EnvLabel, Tab, TabKind } from '@shared/ipc';
import { tabConnectionId } from '@shared/workspace/tabId';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuEntries, type MenuEntry } from '../components/ui/ContextMenu';
import { useStore } from '../store';
import { runningTabIds } from '../tabs/QueryTab/runManager';
import { openNewQueryTab } from '../lib/keybindings';
import { DOCUMENT_COLOR, iconColorFor, type IconKind } from '../lib/objectIcons';
import { copyText } from '@renderer/lib/clipboard';

const ICONS: Record<TabKind, LucideIcon> = {
  query: Code2,
  'table-data': Table2,
  'table-structure': Columns3,
  document: Braces,
  'server-overview': Activity,
  'ddl-preview': FileCode2,
  function: SquareFunction,
  connections: Plug,
  settings: Settings
};

export function tabIcon(kind: TabKind): LucideIcon {
  return ICONS[kind] ?? Code2;
}

/** Tab kinds that show a catalog object borrow that object's colour. */
const TAB_ICON_KIND: Partial<Record<TabKind, IconKind>> = {
  'table-data': 'table',
  'table-structure': 'column',
  function: 'function',
  connections: 'server'
};

export function tabIconColor(kind: TabKind): string {
  if (kind === 'document') return DOCUMENT_COLOR;
  const objectKind = TAB_ICON_KIND[kind];
  return objectKind ? iconColorFor(objectKind) : 'text-muted-foreground';
}

/** Middle-truncate: keeps both ends visible ("sales_cus…mer/42"). */
function middleTruncate(s: string, max = 26): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

export interface TabBarProps {
  onNew?: () => void;
}

export function TabBar({ onNew }: TabBarProps): JSX.Element {
  const { tabs, activeTabId, connections, setActive, closeTab, closeOthers, closeRight, closeAll, togglePin, reorder, openTab, running } =
    useStore(
      useShallow((s) => ({
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        connections: s.connections,
        setActive: s.setActive,
        closeTab: s.closeTab,
        closeOthers: s.closeOthers,
        closeRight: s.closeRight,
        closeAll: s.closeAll,
        togglePin: s.togglePin,
        reorder: s.reorder,
        openTab: s.openTab,
        running: runningTabIds(s.tabRuntime)
      }))
    );
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Keep the active tab in view.
  useEffect(() => {
    if (!activeTabId) return;
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const envOf = useCallback(
    (tab: Tab): EnvLabel | undefined => {
      const cid = tabConnectionId(tab);
      return cid ? connections[cid]?.env : undefined;
    },
    [connections]
  );

  const duplicate = (tab: Tab): void => {
    if (tab.kind !== 'query') return;
    const p = tab.params as Tab<'query'>['params'];
    openTab('query', { ...p, sessionId: crypto.randomUUID() }, { title: `${tab.title} (copy)`, after: tab.id });
  };

  const menuFor = (tab: Tab, index: number): MenuEntry[] => [
    { label: 'Close', onSelect: () => closeTab(tab.id), shortcut: '⌘W' },
    { label: 'Close others', onSelect: () => closeOthers(tab.id), disabled: tabs.length <= 1 },
    { label: 'Close to the right', onSelect: () => closeRight(tab.id), disabled: index >= tabs.length - 1 },
    { label: 'Close all', onSelect: () => closeAll() },
    { label: tab.pinned ? 'Unpin' : 'Pin', onSelect: () => togglePin(tab.id), separatorBefore: true },
    { label: 'Duplicate', onSelect: () => duplicate(tab), disabled: tab.kind !== 'query' },
    {
      label: 'Copy tab path',
      onSelect: () => void copyText(tab.id, 'tab path'),
      separatorBefore: true
    },
    { label: 'Reveal in tree', disabled: true }
  ];

  const onDrop = (to: number): void => {
    if (dragIndex !== null && dragIndex !== to) reorder(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="flex h-[34px] items-end border-b border-border bg-titlebar">
      <div
        ref={stripRef}
        role="tablist"
        className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto overflow-y-hidden px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (e.deltaY !== 0 && stripRef.current) stripRef.current.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, index) => {
          const Icon = tabIcon(tab.kind);
          const active = tab.id === activeTabId;
          const env = envOf(tab);
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  data-tab-id={tab.id}
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  title={tab.title}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tab.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overIndex !== index) setOverIndex(index);
                  }}
                  onDragLeave={() => setOverIndex((v) => (v === index ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(index);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onClick={() => setActive(tab.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(tab.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setActive(tab.id);
                    if (e.key === 'ArrowRight') useStore.getState().activateOffset(1);
                    if (e.key === 'ArrowLeft') useStore.getState().activateOffset(-1);
                  }}
                  className={cn(
                    'group relative flex h-8 flex-none cursor-default select-none items-center gap-1.5 rounded-t-md border border-b-0 border-transparent px-2 pl-2.5 text-[12.5px] text-muted-foreground',
                    tab.pinned ? 'w-9 min-w-9 justify-center px-0' : 'min-w-[120px] max-w-[220px]',
                    active && '-mb-px border-border bg-background text-foreground',
                    !active && 'hover:bg-accent/60',
                    overIndex === index && dragIndex !== null && dragIndex !== index && 'ring-1 ring-primary',
                    dragIndex === index && 'opacity-50',
                    env === 'prod' &&
                      'before:absolute before:-top-px before:left-0 before:right-0 before:h-0.5 before:rounded-t-md before:bg-env-prod-bar'
                  )}
                >
                  {running.includes(tab.id) ? (
                    <LoaderCircle size={14} strokeWidth={2} className="flex-none animate-spin text-primary" />
                  ) : (
                    <Icon size={14} strokeWidth={1.75} className={cn('flex-none', active ? 'text-primary' : tabIconColor(tab.kind))} />
                  )}
                  {!tab.pinned && <span className="flex-1 truncate">{middleTruncate(tab.title)}</span>}
                  {!tab.pinned && (
                    <button
                      type="button"
                      aria-label={`Close ${tab.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="flex h-4 w-4 flex-none items-center justify-center rounded-[3px] opacity-60 hover:bg-accent hover:opacity-100"
                    >
                      {tab.dirty ? (
                        <>
                          <span className="h-[7px] w-[7px] rounded-full bg-primary group-hover:hidden" />
                          <X size={12} strokeWidth={2} className="hidden group-hover:block" />
                        </>
                      ) : (
                        <X size={12} strokeWidth={2} />
                      )}
                    </button>
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <MenuEntries entries={menuFor(tab, index)} />
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        <button
          type="button"
          aria-label="New query tab"
          onClick={onNew ?? openNewQueryTab}
          className="flex h-8 w-[30px] flex-none items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Plus size={14} strokeWidth={1.75} />
        </button>
      </div>

      {tabs.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="All tabs"
              className="flex h-8 w-7 flex-none items-center justify-center border-l border-border text-muted-foreground hover:text-foreground"
            >
              <ChevronDown size={14} strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[60vh] min-w-[240px] overflow-auto text-[12.5px]">
            {tabs.map((tab) => {
              const Icon = tabIcon(tab.kind);
              return (
                <DropdownMenuItem key={tab.id} onSelect={() => setActive(tab.id)} className="gap-2">
                  <Icon size={14} strokeWidth={1.75} className={tabIconColor(tab.kind)} />
                  <span className={cn('flex-1 truncate', tab.id === activeTabId && 'font-medium')}>{tab.title}</span>
                  {tab.dirty && <span className="h-[7px] w-[7px] rounded-full bg-primary" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
