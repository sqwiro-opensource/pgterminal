import { memo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { JsonValue } from '@shared/types/query';
import { isLinkShaped } from '@renderer/lib/format';
import { DocLinkChip } from '@renderer/features/doclink/DocLinkChip';
import { useGridLinkContext, type GridLinkContextValue } from './cells/linkContext';

export interface JsonTreeProps {
  value: JsonValue;
  /** Depth expanded initially (default 2). */
  expandDepth?: number;
  onOpenLink?: (value: string) => void;
  /** Overrides the grid link context (document tab, references). */
  linkCtx?: GridLinkContextValue;
  className?: string;
}

/** Collapsible JSON tree with type colouring; string leaves that are document references become chips. */
export const JsonTree = memo(function JsonTree({ value, expandDepth = 2, onOpenLink, linkCtx, className }: JsonTreeProps) {
  const inherited = useGridLinkContext();
  const ctx = linkCtx ?? inherited;
  return (
    <div className={cn('font-mono text-[12px] leading-[22px]', className)}>
      <Node value={value} depth={0} expandDepth={expandDepth} onOpenLink={onOpenLink} ctx={ctx} />
    </div>
  );
});

function Leaf({ value, onOpenLink, ctx }: { value: JsonValue; onOpenLink?: (v: string) => void; ctx: GridLinkContextValue }) {
  if (value === null) return <span className="italic text-muted-foreground/70">null</span>;
  if (typeof value === 'string') {
    if (isLinkShaped(value)) {
      if (!ctx.editing && ctx.connectionId && ctx.database) {
        return <DocLinkChip raw={value} connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />;
      }
      if (onOpenLink) {
        return (
          <button
            type="button"
            className="rounded border border-primary/20 bg-primary/10 px-1 text-link hover:bg-primary/15 hover:underline decoration-dotted"
            onClick={() => onOpenLink(value)}
          >
            {value}
          </button>
        );
      }
    }
    return <span className="text-str">{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'number') return <span className="text-num">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="text-bool">{String(value)}</span>;
  return null;
}

function Node({
  value,
  name,
  depth,
  expandDepth,
  onOpenLink,
  ctx
}: {
  value: JsonValue;
  name?: string;
  depth: number;
  expandDepth: number;
  onOpenLink?: (v: string) => void;
  ctx: GridLinkContextValue;
}) {
  const isObj = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < expandDepth);
  const label = name !== undefined ? <span className="text-muted-foreground">{name}: </span> : null;

  if (!isObj) {
    return (
      <div className="pl-4">
        {label}
        <Leaf value={value} onOpenLink={onOpenLink} ctx={ctx} />
      </div>
    );
  }
  const isArr = Array.isArray(value);
  const entries: Array<[string, JsonValue]> = isArr
    ? (value as JsonValue[]).map((v, i) => [String(i), v])
    : Object.entries(value as { [k: string]: JsonValue });
  const summary = isArr ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div>
      <button
        type="button"
        className="flex h-[22px] items-center gap-1 rounded px-0.5 hover:bg-accent"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight size={12} strokeWidth={1.75} className={cn('text-muted-foreground transition-transform', open && 'rotate-90')} />
        {label}
        <span className="text-muted-foreground">{summary}</span>
      </button>
      {open && (
        <div className="border-l border-grid-line pl-2 ml-[6px]">
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} expandDepth={expandDepth} onOpenLink={onOpenLink} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}
