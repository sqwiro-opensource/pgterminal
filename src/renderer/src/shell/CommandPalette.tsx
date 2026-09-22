import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Braces, Hash, Play, Search, SquareFunction, Table2, Eye, Hexagon, PanelTop } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useStore, activeConnectionId } from '@renderer/store';
import { useTheme } from '@renderer/lib/theme';
import { onPaletteRequest, setThemeToggle, type PaletteMode } from '@renderer/lib/keybindings';
import { buildItems, parseInput, type PaletteItem } from '@renderer/features/palette/paletteModel';
import { warmObjectIndex } from '@renderer/features/palette/objectIndex';

const ICONS = {
  table: Table2,
  view: Eye,
  function: SquareFunction,
  sequence: Hash,
  type: Hexagon,
  tab: PanelTop,
  action: Play,
  braces: Braces
} as const;

const MODE_HINT: Record<PaletteMode, string> = {
  '': 'Type to search objects, tabs and actions',
  '@': 'Objects — ↵ open data · ⌘↵ structure',
  '#': 'Go to document — type table/id',
  ':': 'Open tabs',
  '>': 'Actions'
};

const LEGEND: Array<[string, string]> = [
  ['@', 'objects'],
  ['#', 'document'],
  [':', 'tabs'],
  ['>', 'actions']
];

/** ⌘K palette. Modes are chosen by the leading character of the input. */
export function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { toggle } = useTheme();

  // The ⌘⇧L binding and the palette's "Toggle theme" action drive the React theme state.
  useEffect(() => {
    setThemeToggle(toggle);
    return () => setThemeToggle(null);
  }, [toggle]);

  useEffect(
    () =>
      onPaletteRequest((mode) => {
        if (mode === null) {
          setOpen(false);
          return;
        }
        const started = performance.now();
        setValue(mode);
        setActive(0);
        setOpen(true);
        void warmObjectIndex();
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log(`[palette] open in ${(performance.now() - started).toFixed(1)} ms`);
        }
      }),
    []
  );

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Prefer the active tab's connection/database; with no tabs open (or a tab that has neither,
  // such as Settings) fall back to a connected server so `#` document lookup still works.
  const ctx = useStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const tabParams = tab?.params as { database?: string } | undefined;
      const connected = Object.keys(s.status).filter((id) => s.status[id]?.state === 'connected');
      const connectionId = activeConnectionId(s) ?? connected[0] ?? null;
      const status = connectionId ? s.status[connectionId] : undefined;
      const database =
        tabParams?.database ??
        status?.openDatabases?.[0] ??
        (connectionId ? s.connections[connectionId]?.defaultDatabase : undefined) ??
        null;
      return { connectionId, database };
    })
  );

  const { mode, query } = useMemo(() => parseInput(value), [value]);
  const items = useMemo(() => (open ? buildItems(mode, query, ctx) : []), [open, mode, query, ctx]);

  const close = useCallback(() => {
    setOpen(false);
    setValue('');
  }, []);

  const runItem = useCallback(
    (item: PaletteItem | undefined, alt: boolean): void => {
      if (!item) return;
      close();
      if (alt && item.runAlt) item.runAlt();
      else item.run();
    },
    [close]
  );

  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items.length, active]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      runItem(items[active], e.metaKey || e.ctrlKey);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-background/40 pt-20 backdrop-blur-[1px]" onMouseDown={close} role="presentation">
      <div
        className="flex h-[420px] w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex h-11 flex-none items-center gap-2 border-b border-border px-3">
          <Search size={14} strokeWidth={1.75} className="flex-none text-muted-foreground" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search objects or run a command"
            aria-label="Command palette input"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="flex-none text-[11px] text-muted-foreground">{MODE_HINT[mode]}</span>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1" role="listbox" aria-label="Results">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
              {mode === '#' ? 'Type a reference like sales_customer/42' : 'No matches'}
            </div>
          ) : (
            items.map((item, i) => {
              const Icon = ICONS[item.icon];
              return (
                <button
                  key={item.id}
                  type="button"
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={(e) => runItem(item, e.metaKey || e.ctrlKey)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] outline-none',
                    i === active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                  )}
                >
                  <Icon size={14} strokeWidth={1.75} className="flex-none text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && i === active && <span className="flex-none text-[11px] text-muted-foreground">{item.hint}</span>}
                  {item.detail && <span className="flex-none font-mono text-[11px] text-muted-foreground">{item.detail}</span>}
                </button>
              );
            })
          )}
        </div>

        <div className="flex h-8 flex-none items-center gap-3 border-t border-border px-3 text-[11px] text-muted-foreground">
          {LEGEND.map(([prefix, label]) => (
            <span key={prefix} className="flex items-center gap-1">
              <span className="kbd">{prefix}</span>
              {label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1">
            <span className="kbd">↵</span> open
            <span className="kbd ml-1">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
