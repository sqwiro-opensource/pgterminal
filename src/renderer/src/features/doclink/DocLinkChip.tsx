import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { Link2, Table2, Unlink } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/popover';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuEntries, type MenuEntry } from '@renderer/components/ui/ContextMenu';
import { docLinks, type LinkContext } from './docLinksService';
import { DocPreviewCard } from './DocPreviewCard';

export type ChipVariant = 'normal' | 'derived' | 'broken';

export interface DocLinkChipProps {
  raw: string;
  connectionId: string;
  database: string;
  variant?: ChipVariant;
  size?: 'sm' | 'md';
  fromTabId?: string;
  preferred?: { schema: string; table: string };
  /** Override navigation (e.g. the document tab passes its own opener). */
  onOpen?(raw: string, opts: { newTab: boolean }): void;
  className?: string;
}

const HOVER_DELAY = 400;
const HIDE_DELAY = 150;

/** Split `schema_table/key` or `schema.table/key` into a muted prefix and the visible remainder. */
export function splitChipLabel(raw: string): { prefix: string; rest: string } {
  const slash = raw.indexOf('/');
  const name = slash >= 0 ? raw.slice(0, slash) : raw;
  const dot = name.indexOf('.');
  if (dot > 0) return { prefix: name.slice(0, dot + 1), rest: raw.slice(dot + 1) };
  const us = name.indexOf('_');
  if (us > 0 && us < name.length - 1) return { prefix: name.slice(0, us + 1), rest: raw.slice(us + 1) };
  return { prefix: '', rest: raw };
}

/** Which variant a value should render with, given whether it resolves in this database. */
export function chipVariantFor(raw: string, connectionId: string, database: string, derived = false): ChipVariant | null {
  const ref = docLinks.isRef(raw);
  if (!ref) return null;
  if (derived) return 'derived';
  if (docLinks.candidates(ref, connectionId, database).length > 0) return 'normal';
  return docLinks.isResolvable(raw, connectionId, database) ? 'normal' : 'broken';
}

export const DocLinkChip = memo(function DocLinkChip(p: DocLinkChipProps) {
  const ref = useMemo(() => docLinks.isRef(p.raw), [p.raw]);
  const ctx: LinkContext = useMemo(
    () => ({ connectionId: p.connectionId, database: p.database, ...(p.fromTabId ? { fromTabId: p.fromTabId } : {}) }),
    [p.connectionId, p.database, p.fromTabId]
  );
  const [hover, setHover] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const enter = (): void => {
    clearTimer();
    timer.current = setTimeout(() => setHover(true), HOVER_DELAY);
  };
  const leave = (): void => {
    clearTimer();
    timer.current = setTimeout(() => setHover(false), HIDE_DELAY);
  };
  useEffect(() => clearTimer, []);

  const open = useCallback(
    async (newTab: boolean, peek = false): Promise<void> => {
      setHover(false);
      if (!ref) return;
      if (p.onOpen && !peek) {
        p.onOpen(p.raw, { newTab });
        return;
      }
      const target = await docLinks.open(ref, { ...ctx, newTab, peek, ...(p.preferred ? { preferred: p.preferred } : {}) });
      if (!target) setNotFound(true);
    },
    [ref, ctx, p]
  );

  const variant: ChipVariant = notFound ? 'broken' : (p.variant ?? 'normal');
  const { prefix, rest } = splitChipLabel(p.raw);
  const Icon = variant === 'broken' ? Unlink : variant === 'derived' ? Link2 : Table2;

  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    void open(e.metaKey || e.ctrlKey, e.shiftKey);
  };
  const onAux = (e: MouseEvent): void => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      void open(true);
    }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void open(e.metaKey || e.ctrlKey);
    }
  };

  const menu: MenuEntry[] = [
    { label: 'Open', onSelect: () => void open(false) },
    { label: 'Open in new tab', onSelect: () => void open(true) },
    { label: 'Peek in inspector', onSelect: () => void open(false, true) },
    { label: 'Copy _id', separatorBefore: true, onSelect: () => void navigator.clipboard.writeText(p.raw) },
    {
      label: 'Copy target SQL',
      onSelect: () => {
        if (!ref) return;
        void docLinks.resolve(ref, ctx, p.preferred).then((r) => {
          if (r.status === 'found') void navigator.clipboard.writeText(docLinks.targetSql(r.target));
        });
      }
    },
    { label: 'Open in table', separatorBefore: true, onSelect: () => ref && void docLinks.openInTable(ref, { ...ctx, ...(p.preferred ? { preferred: p.preferred } : {}) }) }
  ];

  if (!ref) return <span className="font-mono text-[12px]">{p.raw}</span>;

  return (
    <ContextMenu>
      <Popover open={hover}>
        <PopoverTrigger asChild>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              title={variant === 'broken' ? `${p.raw} — not found` : undefined}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded border px-1.5 pl-1 font-mono leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                p.size === 'md' ? 'h-5 text-[12.5px]' : 'h-[18px] text-[12px]',
                variant === 'normal' && 'border-primary/20 bg-primary/[.08] text-link hover:bg-primary/[.14] hover:underline decoration-dotted',
                variant === 'derived' && 'border-dashed border-primary/30 bg-transparent text-link hover:bg-primary/[.08]',
                variant === 'broken' && 'border-dashed border-destructive/45 bg-transparent text-muted-foreground',
                p.className
              )}
              onClick={onClick}
              onAuxClick={onAux}
              onKeyDown={onKey}
              onMouseEnter={enter}
              onMouseLeave={leave}
            >
              <Icon size={12} strokeWidth={1.75} className="flex-none" />
              <span className="truncate">
                {prefix && <span className="text-muted-foreground">{prefix}</span>}
                {rest}
              </span>
            </button>
          </ContextMenuTrigger>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="w-auto p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={clearTimer}
          onMouseLeave={leave}
        >
          {hover && variant !== 'broken' && <DocPreviewCard ref_={ref} ctx={ctx} preferred={p.preferred} onOpen={(nt) => void open(nt)} />}
          {hover && variant === 'broken' && <div className="px-3 py-2 text-[12px] text-muted-foreground">Row not found</div>}
        </PopoverContent>
      </Popover>
      <ContextMenuContent>
        <MenuEntries entries={menu} />
      </ContextMenuContent>
    </ContextMenu>
  );
});

/** A list of chips with an overflow badge (grid cells for arrays of refs). */
export function DocLinkChipList({ values, max = 2, ...rest }: { values: string[]; max?: number } & Omit<DocLinkChipProps, 'raw'>): JSX.Element {
  const shown = values.slice(0, max);
  const extra = values.length - shown.length;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {shown.map((v, i) => (
        <DocLinkChip key={`${v}-${i}`} raw={v} {...rest} />
      ))}
      {extra > 0 && <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">+{extra}</span>}
    </span>
  );
}
