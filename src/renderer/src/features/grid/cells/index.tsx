import { memo, useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/popover';
import type { CellValue, JsonValue } from '@shared/types/query';
import { isLinkShaped, type FormattedCell } from '@renderer/lib/format';
import { DocLinkChip, DocLinkChipList } from '@renderer/features/doclink/DocLinkChip';
import { fkChipRaw } from '@renderer/features/doclink/fkChips';
import { JsonTree } from '../JsonTree';
import { useGridLinkContext } from './linkContext';

interface CellProps {
  f: FormattedCell;
  raw: CellValue;
  onOpenLink?: (value: string) => void;
  /** Column id, so sole-column FK cells can render derived chips. */
  colId?: string;
}

export const NullCell = memo(function NullCell() {
  return <span className="italic text-muted-foreground/70">NULL</span>;
});

export const DefaultCell = memo(function DefaultCell() {
  return <span className="italic text-muted-foreground">DEFAULT</span>;
});

export const EmptyCell = memo(function EmptyCell() {
  return <span title="empty string" className="inline-block h-full w-full" />;
});

export const NumberCell = memo(function NumberCell({ f, colId }: CellProps & { raw: CellValue }) {
  const ctx = useGridLinkContext();
  const fk = colId && !ctx.editing && ctx.connectionId && ctx.database ? ctx.fkColumns?.[colId] : undefined;
  const derived = fk ? fkChipRaw(fk, f.text) : null;
  if (derived && ctx.connectionId && ctx.database) {
    return (
      <span className="block w-full text-right">
        <DocLinkChip raw={derived} variant="derived" connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />
      </span>
    );
  }
  return <span className="block w-full text-right font-mono text-num tabular-nums">{f.text}</span>;
});

export const BoolCell = memo(function BoolCell({ f }: CellProps) {
  const on = f.text === 'true';
  return (
    <span className={`font-mono ${on ? 'text-bool' : 'text-muted-foreground'}`}>
      <i className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[1px] ${on ? 'bg-bool' : 'bg-muted-foreground'}`} />
      {f.text}
    </span>
  );
});

export const TimeCell = memo(function TimeCell({ f }: CellProps) {
  return (
    <span className="font-mono text-time" title={f.title}>
      {f.text}
    </span>
  );
});

export const UuidCell = memo(function UuidCell({ f, raw, colId }: CellProps) {
  const ctx = useGridLinkContext();
  const fk = colId && !ctx.editing && ctx.connectionId && ctx.database ? ctx.fkColumns?.[colId] : undefined;
  const derived = fk ? fkChipRaw(fk, raw) : null;
  if (derived && ctx.connectionId && ctx.database) {
    return <DocLinkChip raw={derived} variant="derived" connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />;
  }
  return (
    <span className="font-mono text-[12px] text-muted-foreground" title={f.text}>
      {f.text}
    </span>
  );
});

export const ByteaCell = memo(function ByteaCell({ f }: CellProps) {
  return (
    <span className="font-mono text-muted-foreground" title={f.title}>
      {f.text}
    </span>
  );
});

export const ArrayCell = memo(function ArrayCell({ f, raw }: CellProps) {
  const ctx = useGridLinkContext();
  const count = /^(\d+) item/.exec(f.title ?? '')?.[1];
  if (!ctx.editing && ctx.connectionId && ctx.database && Array.isArray(raw) && raw.length > 0 && raw.every((v) => typeof v === 'string' && isLinkShaped(v))) {
    return <DocLinkChipList values={raw as string[]} connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />;
  }
  return (
    <span className="font-mono" title={f.title}>
      {f.text}
      {count !== undefined && (
        <span className="ml-1.5 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{count}</span>
      )}
    </span>
  );
});

export const TextCell = memo(function TextCell({ f, raw, onOpenLink, colId }: CellProps) {
  const ctx = useGridLinkContext();
  if (!ctx.editing && ctx.connectionId && ctx.database && typeof raw === 'string') {
    if (isLinkShaped(raw)) {
      return <DocLinkChip raw={raw} connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />;
    }
    const fk = colId ? ctx.fkColumns?.[colId] : undefined;
    const derived = fk ? fkChipRaw(fk, raw) : null;
    if (derived) {
      return <DocLinkChip raw={derived} variant="derived" connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />;
    }
  }
  if (onOpenLink && typeof raw === 'string' && isLinkShaped(raw)) {
    return (
      <button
        type="button"
        className="inline-flex h-[18px] items-center rounded border border-primary/20 bg-primary/10 px-1.5 font-mono text-[12px] text-link hover:bg-primary/15 hover:underline decoration-dotted"
        onClick={(e) => {
          e.stopPropagation();
          onOpenLink(raw);
        }}
      >
        {raw}
      </button>
    );
  }
  return <span title={f.title}>{f.text}</span>;
});

export const JsonCell = memo(function JsonCell({ f, raw, onOpenLink }: CellProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full truncate text-left font-mono text-[12px] hover:underline decoration-dotted"
          title={f.title ?? 'Click to expand'}
          onClick={(e) => e.stopPropagation()}
        >
          {f.text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[480px] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex h-8 items-center gap-2 border-b border-border px-3 text-[12px] font-semibold">
          <span className="font-mono">{'{}'}</span> JSON
          <button
            type="button"
            className="ml-auto inline-flex h-6 items-center gap-1 rounded px-2 text-[11.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(raw, null, 2))}
          >
            <Copy size={12} strokeWidth={1.75} /> Copy JSON
          </button>
        </div>
        <div className="max-h-[320px] overflow-auto p-2">
          <JsonTree value={raw as JsonValue} onOpenLink={onOpenLink} />
        </div>
      </PopoverContent>
    </Popover>
  );
});

/** Pick the renderer for a formatted cell. `colId` enables derived FK chips. */
export function renderCell(f: FormattedCell, raw: CellValue, onOpenLink?: (v: string) => void, colId?: string): ReactNode {
  switch (f.kind) {
    case 'null':
      return <NullCell />;
    case 'default':
      return <DefaultCell />;
    case 'empty':
      return <EmptyCell />;
    case 'number':
      return <NumberCell f={f} raw={raw} colId={colId} />;
    case 'bool':
      return <BoolCell f={f} raw={raw} />;
    case 'time':
      return <TimeCell f={f} raw={raw} />;
    case 'uuid':
      return <UuidCell f={f} raw={raw} colId={colId} />;
    case 'json':
      return <JsonCell f={f} raw={raw} onOpenLink={onOpenLink} />;
    case 'bytea':
      return <ByteaCell f={f} raw={raw} />;
    case 'array':
      return <ArrayCell f={f} raw={raw} />;
    default:
      return <TextCell f={f} raw={raw} onOpenLink={onOpenLink} colId={colId} />;
  }
}
