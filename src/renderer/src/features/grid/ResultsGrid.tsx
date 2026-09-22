import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { CellValue, FieldInfo, PgErrorInfo } from '@shared/types/query';
import { GridHeader, type SortSpec } from './GridHeader';
import { GridRow, formattedAt } from './GridRow';
import { GUTTER_WIDTH, buildColumns, rowToJson, sortRows, type GridColumn } from './gridModel';
import { useColumnSizing } from './useColumnSizing';
import { useGridSelection } from './useGridSelection';
import { GridLinkContext, type GridLinkContextValue } from './cells/linkContext';
import { GridErrorCard, GridSkeleton } from './GridStates';

const NO_LINK_CTX: GridLinkContextValue = {};

export type Density = 'compact' | 'default' | 'comfortable';
const ROW_HEIGHT: Record<Density, number> = { compact: 24, default: 28, comfortable: 32 };
const HEADER_HEIGHT = 26;

export interface ResultsGridProps {
  fields: FieldInfo[];
  rows: CellValue[][];
  pkColumns?: string[];
  fkColumns?: Record<string, { schema: string; table: string }>;
  density?: Density;
  loading?: boolean;
  error?: PgErrorInfo | null;
  emptyText?: string;
  /** Controlled sort; when `onSortChange` is given the grid never sorts client-side. */
  sort?: SortSpec[];
  onSortChange?(sort: SortSpec[]): void;
  onCellActivate?(rowIndex: number, colId: string): void;
  onSelectionChange?(rowIndexes: number[]): void;
  onFocusRow?(rowIndex: number | null): void;
  onOpenLink?(value: string): void;
  /** Connection/database the values belong to; enables document-link chips in cells. */
  linkCtx?: GridLinkContextValue;
  /** localStorage key for persisted column widths. */
  sizingKey?: string;
  className?: string;
  /* ---- edit mode (table-data tab) ---- */
  editable?: boolean;
  /** Stable key per row index (PK-derived); required for pending/error/deleted highlighting. */
  rowKeys?: string[];
  /** `${rowKey}:${colId}` of every pending cell. */
  pendingCells?: Set<string>;
  errorRows?: Set<string>;
  deletedRows?: Set<string>;
  editingCell?: { rowIndex: number; colId: string } | null;
  /** Enter/F2/typing on a cell; `initialText` is the printable key that started typing. */
  onEditStart?(rowIndex: number, colId: string, initialText?: string): void;
  onRevertCell?(rowIndex: number, colId: string): void;
  onSetNull?(rowIndex: number, colId: string): void;
  /** Renders the in-cell editor for `editingCell`. */
  renderEditor?(rowIndex: number, colId: string): ReactNode;
}

/** Virtualised (rows and columns) result grid; columns come from the result fields only. */
export function ResultsGrid(p: ResultsGridProps) {
  const rowHeight = ROW_HEIGHT[p.density ?? 'default'];
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [localSort, setLocalSort] = useState<SortSpec[]>([]);
  const sort = p.sort ?? localSort;
  const controlled = Boolean(p.onSortChange);

  const columns = useMemo(() => {
    const cols = buildColumns(p.fields, { pkColumns: p.pkColumns, fkColumns: p.fkColumns, hidden });
    if (pinned.size === 0) return cols;
    return [...cols.filter((c) => pinned.has(c.id)), ...cols.filter((c) => !pinned.has(c.id))];
  }, [p.fields, p.pkColumns, p.fkColumns, hidden, pinned]);

  const rows = useMemo(() => (controlled ? p.rows : sortRows(p.rows, columns, sort)), [controlled, p.rows, columns, sort]);
  const { widthOf, total, setSizing } = useColumnSizing(columns, p.sizingKey);
  const sel = useGridSelection(rows.length, columns.length);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => rowHeight, overscan: 8 });
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => widthOf(columns[i] as GridColumn),
    overscan: 3
  });
  useEffect(() => colVirtualizer.measure(), [columns, widthOf, colVirtualizer]);

  useEffect(() => p.onSelectionChange?.([...sel.selected].sort((a, b) => a - b)), [sel.selected, p.onSelectionChange]);
  useEffect(() => p.onFocusRow?.(sel.focus ? sel.focus.row : null), [sel.focus, p.onFocusRow]);
  useEffect(() => {
    if (sel.focus) rowVirtualizer.scrollToIndex(sel.focus.row, { align: 'auto' });
  }, [sel.focus, rowVirtualizer]);

  const setSort = useCallback((next: SortSpec[]) => (controlled ? p.onSortChange?.(next) : setLocalSort(next)), [controlled, p.onSortChange]);
  const onSortClick = useCallback(
    (colId: string, additive: boolean) => {
      const cur = sort.find((s) => s.column === colId);
      const rest = additive ? sort.filter((s) => s.column !== colId) : [];
      if (!cur) setSort([...rest, { column: colId, dir: 'asc' }]);
      else if (cur.dir === 'asc') setSort([...rest, { column: colId, dir: 'desc' }]);
      else setSort(rest);
    },
    [sort, setSort]
  );

  const resizing = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const onResizeStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      const col = columns.find((c) => c.id === id);
      if (!col) return;
      resizing.current = { id, startX: e.clientX, startW: widthOf(col) };
      const move = (ev: PointerEvent) => {
        const r = resizing.current;
        if (!r) return;
        setSizing((s) => ({ ...s, [r.id]: Math.max(48, r.startW + ev.clientX - r.startX) }));
      };
      const up = () => {
        resizing.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [columns, widthOf, setSizing]
  );

  const copy = useCallback(
    (what: 'cell' | 'rows') => {
      if (what === 'cell' && sel.focus) {
        const col = columns[sel.focus.col];
        const row = rows[sel.focus.row];
        if (col && row) void navigator.clipboard.writeText(formattedAt(row, col).kind === 'null' ? '' : String(formattedAt(row, col).title ?? formattedAt(row, col).text));
        return;
      }
      const idx = sel.selected.size ? [...sel.selected].sort((a, b) => a - b) : sel.focus ? [sel.focus.row] : [];
      if (idx.length === 0) return;
      const asJson = idx.map((i) => rowToJson(rows[i] as CellValue[], p.fields));
      void navigator.clipboard.writeText(idx.length === 1 ? JSON.stringify(asJson[0], null, 2) : JSON.stringify(asJson, null, 2));
    },
    [sel.focus, sel.selected, columns, rows, p.fields]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (p.editingCell) return; // the editor owns the keyboard while open
      if (p.editable && sel.focus) {
        const colId = columns[sel.focus.col]?.id ?? '';
        const meta = e.metaKey || e.ctrlKey;
        if (e.key === 'F2') return void (e.preventDefault(), p.onEditStart?.(sel.focus.row, colId));
        if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') return void (e.preventDefault(), p.onRevertCell?.(sel.focus.row, colId));
        if (meta && e.shiftKey && e.key === 'Backspace') return void (e.preventDefault(), p.onSetNull?.(sel.focus.row, colId));
        if (!meta && !e.altKey && e.key.length === 1) return void (e.preventDefault(), p.onEditStart?.(sel.focus.row, colId, e.key));
      }
      const r = sel.handleKey(e);
      if (!r) return;
      e.preventDefault();
      if (r === 'activate' && sel.focus) p.onCellActivate?.(sel.focus.row, columns[sel.focus.col]?.id ?? '');
      if (r === 'copyCell') copy('cell');
      if (r === 'copyRows') copy('rows');
    },
    [sel, columns, p.onCellActivate, copy, p.editable, p.editingCell, p.onEditStart, p.onRevertCell, p.onSetNull]
  );

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const totalWidth = Math.max(total, colVirtualizer.getTotalSize());

  if (p.error) return <GridErrorCard error={p.error} />;
  if (p.loading && rows.length === 0) return <GridSkeleton columns={columns} widthOf={widthOf} rowHeight={rowHeight} />;
  if (!p.loading && rows.length === 0)
    return <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">{p.emptyText ?? 'No rows'}</div>;

  return (
    <GridLinkContext.Provider value={p.editingCell ? { ...(p.linkCtx ?? NO_LINK_CTX), editing: true } : (p.linkCtx ?? NO_LINK_CTX)}>
    <div
      ref={scrollRef}
      role="grid"
      aria-rowcount={rows.length}
      aria-colcount={columns.length}
      tabIndex={0}
      className={cn('relative h-full w-full overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring', p.className)}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) sel.clear();
      }}
    >
      <GridHeader
        columns={columns}
        virtualCols={virtualCols}
        totalWidth={totalWidth}
        height={HEADER_HEIGHT}
        sort={sort}
        pinned={pinned}
        allSelected={rows.length > 0 && sel.selected.size === rows.length}
        onToggleAll={() => (sel.selected.size === rows.length ? sel.clear() : sel.selectAll())}
        onSortClick={onSortClick}
        onSort={(id, dir) => setSort([{ column: id, dir }])}
        onHide={(id) => setHidden((h) => new Set([...h, id]))}
        onPin={(id) =>
          setPinned((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        onResizeStart={onResizeStart}
      />
      <div className="relative" style={{ height: rowVirtualizer.getTotalSize(), width: totalWidth + GUTTER_WIDTH }}>
        {virtualRows.map((vr) => {
          const row = rows[vr.index];
          if (!row) return null;
          return (
            <GridRow
              key={vr.key}
              row={row}
              rowIndex={vr.index}
              displayIndex={vr.index}
              top={vr.start}
              height={vr.size}
              columns={columns}
              virtualCols={virtualCols}
              totalWidth={totalWidth}
              selected={sel.selected.has(vr.index)}
              focusCol={sel.focus?.row === vr.index ? sel.focus.col : null}
              zebra={vr.index % 2 === 1}
              onToggle={(i, e) => sel.toggleRow(i, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey || true })}
              onCellClick={(r, c, e) => {
                sel.setFocus({ row: r, col: c });
                if (e.shiftKey) sel.toggleRow(r, { shift: true });
                else if (e.metaKey || e.ctrlKey) sel.toggleRow(r, { meta: true });
              }}
              onCellDoubleClick={(r, c) => p.onCellActivate?.(r, columns[c]?.id ?? '')}
              onOpenLink={p.onOpenLink}
              rowKey={p.rowKeys?.[vr.index]}
              pendingCells={p.pendingCells}
              rowError={Boolean(p.rowKeys && p.errorRows?.has(p.rowKeys[vr.index] ?? ''))}
              deleted={Boolean(p.rowKeys && p.deletedRows?.has(p.rowKeys[vr.index] ?? ''))}
              editingCol={p.editingCell?.rowIndex === vr.index ? p.editingCell.colId : null}
              editor={p.editingCell?.rowIndex === vr.index && p.renderEditor ? p.renderEditor(vr.index, p.editingCell.colId) : null}
            />
          );
        })}
      </div>
      {p.loading && <div className="pointer-events-none absolute inset-x-0 top-[26px] h-0.5 animate-pulse bg-primary/60" />}
    </div>
    </GridLinkContext.Provider>
  );
}

