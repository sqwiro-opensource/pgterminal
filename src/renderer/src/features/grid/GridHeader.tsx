import { memo } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, KeyRound, Link2 } from 'lucide-react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@cloudhub-ux/shadcn/esm/components/ui/dropdown-menu';
import { Checkbox } from '@cloudhub-ux/shadcn/esm/components/ui/checkbox';
import type { GridColumn } from './gridModel';
import { GUTTER_WIDTH } from './gridModel';
import { copyText } from '@renderer/lib/clipboard';

export interface SortSpec {
  column: string;
  dir: 'asc' | 'desc';
}

export interface GridHeaderProps {
  columns: GridColumn[];
  virtualCols: VirtualItem[];
  totalWidth: number;
  height: number;
  sort: SortSpec[];
  pinned: Set<string>;
  allSelected: boolean;
  onToggleAll(): void;
  onSortClick(colId: string, additive: boolean): void;
  onSort(colId: string, dir: 'asc' | 'desc'): void;
  onHide(colId: string): void;
  onPin(colId: string): void;
  onResizeStart(colId: string, e: React.PointerEvent): void;
}

/** Sticky header row: gutter checkbox + virtualised column headers with type labels, sort and menus. */
export const GridHeader = memo(function GridHeader(p: GridHeaderProps) {
  return (
    <div
      role="row"
      className="sticky top-0 z-[3] border-b border-border bg-grid-header"
      style={{ height: p.height, width: p.totalWidth + GUTTER_WIDTH }}
    >
      <div
        className="sticky left-0 z-[4] flex items-center justify-center border-r border-grid-line bg-grid-header"
        style={{ width: GUTTER_WIDTH, height: p.height, position: 'absolute', top: 0 }}
      >
        <Checkbox checked={p.allSelected} onCheckedChange={() => p.onToggleAll()} aria-label="Select all rows" className="h-3.5 w-3.5" />
      </div>
      {p.virtualCols.map((vc) => {
        const col = p.columns[vc.index];
        if (!col) return null;
        const s = p.sort.find((x) => x.column === col.id);
        const sortIdx = p.sort.findIndex((x) => x.column === col.id);
        return (
          <div
            key={col.id}
            role="columnheader"
            aria-sort={s ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            className={cn(
              'group absolute top-0 flex items-center gap-1 border-r border-grid-line px-2 text-[13px] font-medium select-none',
              p.pinned.has(col.id) && 'bg-grid-header'
            )}
            style={{ left: vc.start + GUTTER_WIDTH, width: vc.size, height: p.height }}
            onClick={(e) => p.onSortClick(col.id, e.shiftKey)}
          >
            {col.isPk && <KeyRound size={12} strokeWidth={2} className="text-warning" />}
            {col.isFk && !col.isPk && <Link2 size={12} strokeWidth={2} className="text-link" />}
            <span className="truncate">{col.header}</span>
            <span className="truncate font-mono text-[10px] font-normal text-muted-foreground">{col.dataType}</span>
            {s && (
              <span className="ml-auto flex items-center text-muted-foreground">
                {s.dir === 'asc' ? <ArrowUp size={12} strokeWidth={2} /> : <ArrowDown size={12} strokeWidth={2} />}
                {p.sort.length > 1 && <span className="text-[9px]">{sortIdx + 1}</span>}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Column menu for ${col.header}`}
                  className={cn(
                    'ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100',
                    s && 'ml-0'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronDown size={12} strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px] text-[12.5px]">
                <DropdownMenuItem onSelect={() => p.onSort(col.id, 'asc')}>
                  <ArrowUp size={12} className="mr-2" /> Sort ascending
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => p.onSort(col.id, 'desc')}>
                  <ArrowDown size={12} className="mr-2" /> Sort descending
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => p.onHide(col.id)}>Hide column</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => p.onPin(col.id)}>{p.pinned.has(col.id) ? 'Unpin' : 'Pin left'}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void copyText(col.header, 'column name')}>Copy column name</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div
              role="separator"
              aria-orientation="vertical"
              className="absolute -right-[3px] top-0 z-[1] h-full w-[6px] cursor-col-resize hover:bg-primary/40"
              onPointerDown={(e) => {
                e.stopPropagation();
                p.onResizeStart(col.id, e);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        );
      })}
    </div>
  );
});
