import { memo, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Checkbox } from '@cloudhub-ux/shadcn/esm/components/ui/checkbox';
import type { CellValue } from '@shared/types/query';
import { formatCell, type FormattedCell } from '@renderer/lib/format';
import { renderCell } from './cells';
import { GUTTER_WIDTH, type GridColumn } from './gridModel';

/** Lazily formatted cells, cached per row array so re-renders never re-format. */
const cache = new WeakMap<CellValue[], Array<FormattedCell | undefined>>();

export function formattedAt(row: CellValue[], col: GridColumn): FormattedCell {
  let arr = cache.get(row);
  if (!arr) {
    arr = new Array<FormattedCell | undefined>(row.length);
    cache.set(row, arr);
  }
  let f = arr[col.index];
  if (!f) {
    f = formatCell(row[col.index] ?? null, col.dataType);
    arr[col.index] = f;
  }
  return f;
}

export interface GridRowProps {
  row: CellValue[];
  rowIndex: number;
  displayIndex: number;
  top: number;
  height: number;
  columns: GridColumn[];
  virtualCols: VirtualItem[];
  totalWidth: number;
  selected: boolean;
  focusCol: number | null;
  zebra: boolean;
  onToggle(rowIndex: number, e: React.MouseEvent): void;
  onCellClick(rowIndex: number, colIndex: number, e: React.MouseEvent): void;
  onCellDoubleClick(rowIndex: number, colIndex: number): void;
  onOpenLink?: (value: string) => void;
  /* edit mode */
  rowKey?: string | undefined;
  pendingCells?: Set<string> | undefined;
  rowError?: boolean;
  deleted?: boolean;
  editingCol?: string | null;
  editor?: ReactNode;
}

/** One virtualised row: sticky gutter with index/checkbox plus virtualised cells. */
export const GridRow = memo(function GridRow(p: GridRowProps) {
  const hasPending = Boolean(p.rowKey && p.pendingCells && [...p.pendingCells].some((k) => k.startsWith(`${p.rowKey}:`)));
  return (
    <div
      role="row"
      aria-rowindex={p.displayIndex + 1}
      aria-selected={p.selected}
      className={cn(
        'group absolute left-0 border-b border-grid-line',
        p.zebra && !p.selected && 'bg-grid-alt',
        p.selected && 'bg-grid-selected/10',
        p.rowError && 'bg-destructive/10',
        p.deleted && 'line-through opacity-60'
      )}
      style={{ top: p.top, height: p.height, width: p.totalWidth + GUTTER_WIDTH }}
    >
      <div
        className={cn(
          'sticky left-0 z-[2] flex h-full items-center justify-end gap-1 border-r border-grid-line bg-grid-header pr-1.5 font-mono text-[11px] text-muted-foreground',
          p.selected && 'bg-grid-selected/10'
        )}
        style={{ width: GUTTER_WIDTH, position: 'absolute' }}
        onClick={(e) => p.onToggle(p.rowIndex, e)}
      >
        {hasPending && <Pencil size={11} strokeWidth={1.75} className="text-pending" />}
        <span className={cn('group-hover:hidden', p.selected && 'hidden')}>{p.displayIndex + 1}</span>
        <span className={cn('hidden group-hover:inline-flex', p.selected && 'inline-flex')} onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={p.selected}
            aria-label={`Select row ${p.displayIndex + 1}`}
            className="h-3.5 w-3.5"
            onClick={(e) => p.onToggle(p.rowIndex, e)}
          />
        </span>
      </div>
      {p.virtualCols.map((vc) => {
        const col = p.columns[vc.index];
        if (!col) return null;
        const f = formattedAt(p.row, col);
        const focused = p.focusCol === vc.index;
        const pending = Boolean(p.rowKey && p.pendingCells?.has(`${p.rowKey}:${col.id}`));
        const editing = p.editingCol === col.id;
        return (
          <div
            key={col.id}
            role="gridcell"
            tabIndex={-1}
            aria-colindex={vc.index + 1}
            data-kind={f.kind}
            className={cn(
              'absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-r border-grid-line px-2 text-[12.5px]',
              col.align === 'right' && 'justify-end',
              focused && !editing && 'z-[1] ring-2 ring-inset ring-ring',
              pending && 'bg-pending/10 shadow-[inset_3px_0_0_hsl(var(--pending))]',
              editing && 'z-[3] overflow-visible bg-background p-0 ring-2 ring-inset ring-ring'
            )}
            style={{ left: vc.start + GUTTER_WIDTH, width: vc.size }}
            onClick={(e) => p.onCellClick(p.rowIndex, vc.index, e)}
            onDoubleClick={() => p.onCellDoubleClick(p.rowIndex, vc.index)}
          >
            {editing ? p.editor : <span className="min-w-0 truncate">{renderCell(f, p.row[col.index] ?? null, p.onOpenLink, col.id)}</span>}
          </div>
        );
      })}
    </div>
  );
});
