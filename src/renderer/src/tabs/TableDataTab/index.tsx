import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Lock, Plus, SquareCode, Table2, Trash2 } from 'lucide-react';
import { iconColorFor } from '@renderer/lib/objectIcons';
import { toast } from 'sonner';
import type { Tab } from '@shared/types/workspace';
import type { CellValue, PgErrorInfo } from '@shared/types/query';
import { useStore } from '@renderer/store';
import { pgterminal } from '@renderer/lib/ipc';
import { IconButton } from '@renderer/components/ui/IconButton';
import { ResultsGrid, RowDetail, useRowDetailSettings } from '@renderer/features/grid';
import { rowKeyOf } from '@renderer/features/grid/gridModel';
import { useEditBuffer } from '@renderer/features/grid/useEditBuffer';
import { CellEditor } from '@renderer/features/grid/cellEditors';
import { ExportMenu } from '@renderer/features/grid/exportMenu';
import { useRelationNode } from '@renderer/tabs/TableStructureTab/useRelationNode';
import { useTableData } from './useTableData';
import { FilterBar } from './FilterBar';
import { Pager } from './Pager';
import { EditFooter } from './EditFooter';
import { InsertRows } from './InsertRows';
import { applyOps, deleteRows, pendingCloseGuard } from './tableActions';
import { useRefreshSignal } from '@renderer/tabs/useTab';

type Editing = { rowIndex: number; colId: string; initialText?: string } | null;

export default function TableDataTab({ tab: anyTab }: { tab: Tab }) {
  const tab = anyTab as Tab<'table-data'>;
  const { connectionId, database, schema, table, filters, sort } = tab.params;
  const ref = useMemo(() => ({ connectionId, database, schema, table }), [connectionId, database, schema, table]);
  const { rt, limit, keyset, next, prev, first, goTo, refresh, loadCount } = useTableData(tab);
  useRefreshSignal(tab.id, refresh);
  const rel = useRelationNode(ref);
  const meta = useStore((s) => s.connections[connectionId]);
  const density = useStore((s) => s.settings.density);
  const detail = useRowDetailSettings();
  const { updateParams, setDirty, registerCloseGuard, openTab, updateSettings } = useStore.getState();

  const page = rt.page;
  const fields = page?.fields ?? [];
  const pkColumns = page?.pkColumns ?? [];
  const pkIndexes = useMemo(() => pkColumns.map((c) => fields.findIndex((f) => f.name === c)), [pkColumns, fields]);
  const rowKeys = useMemo(() => (page ? page.rows.map((r, i) => rowKeyOf(r, pkIndexes, i)) : []), [page, pkIndexes]);
  const buf = useEditBuffer(fields, pkColumns);
  const displayRows = useMemo(() => (page ? page.rows.map((r, i) => buf.displayRow(rowKeys[i] ?? '', r)) : []), [page, rowKeys, buf]);
  const readOnly = Boolean(meta?.readOnly) || pkColumns.length === 0;
  const [editing, setEditing] = useState<Editing>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<(PgErrorInfo & { opIndex: number }) | null>(null);
  const [errorRows, setErrorRows] = useState<Set<string>>(() => new Set());

  useEffect(() => setDirty(tab.id, buf.dirty), [buf.dirty, tab.id, setDirty]);

  const rowByKey = useCallback((k: string) => page?.rows[rowKeys.indexOf(k)], [page, rowKeys]);
  const ops = useCallback(() => buf.toOps(rowByKey), [buf, rowByKey]);
  const opKeys = useCallback(() => [...Object.keys(buf.buffer.updates), ...buf.buffer.inserts.map((_, i) => `+${i}`), ...buf.buffer.deletes], [buf.buffer]);

  const apply = useCallback(async (): Promise<boolean> => {
    if (!buf.dirty || applying) return true;
    setApplying(true);
    setApplyError(null);
    try {
      const list = ops();
      const out = await applyOps(ref, list);
      if (out.ok) {
        buf.clear();
        setErrorRows(new Set());
        refresh();
        return true;
      }
      if (out.error) {
        setApplyError(out.error);
        const bad = opKeys()[out.error.opIndex];
        setErrorRows(new Set(bad ? [bad] : []));
      }
      return false;
    } catch (err) {
      toast.error('Apply failed', { description: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      setApplying(false);
    }
  }, [buf, applying, ops, opKeys, ref, refresh]);

  useEffect(() => {
    registerCloseGuard(tab.id, buf.dirty ? pendingCloseGuard(buf.count, apply) : null);
    return () => registerCloseGuard(tab.id, null);
  }, [buf.dirty, buf.count, apply, tab.id, registerCloseGuard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && useStore.getState().activeTabId === tab.id) {
        e.preventDefault();
        void apply();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, tab.id]);

  const startEdit = (rowIndex: number, colId: string, initialText?: string) => {
    if (readOnly) return void toast.info(pkColumns.length === 0 ? 'No primary key — inline editing is disabled. Edit via a query.' : 'Read-only connection');
    const col = fields.find((f) => f.name === colId);
    const info = rel.node?.columns?.find((c) => c.name === colId);
    if (!col) return;
    if (info?.generated) return void toast.info(`${colId} is a generated column`);
    setEditing({ rowIndex, colId, ...(initialText !== undefined ? { initialText } : {}) });
  };
  const commitEdit = (value: CellValue, advance?: 'next' | 'down') => {
    if (!editing || !page) return;
    const original = page.rows[editing.rowIndex];
    const key = rowKeys[editing.rowIndex];
    if (original && key !== undefined) buf.setCell(key, original, editing.colId, value);
    if (advance === 'down' && editing.rowIndex + 1 < page.rows.length) setEditing({ rowIndex: editing.rowIndex + 1, colId: editing.colId });
    else if (advance === 'next') {
      const i = fields.findIndex((f) => f.name === editing.colId);
      const nextCol = fields[i + 1];
      setEditing(nextCol ? { rowIndex: editing.rowIndex, colId: nextCol.name } : null);
    } else setEditing(null);
  };
  const fetchAll = async (onProgress: (n: number) => void): Promise<CellValue[][]> => {
    const all: CellValue[][] = [];
    let after: Record<string, CellValue> | null = null;
    for (let i = 0; i < 1000; i++) {
      const res = await pgterminal['rows:fetch']({ ...ref, filters, sort: [], limit: 5000, page: { mode: 'keyset', after } });
      all.push(...res.rows);
      onProgress(all.length);
      if (!res.hasMore || all.length >= 200_000) break;
      const last = res.rows[res.rows.length - 1];
      if (!last) break;
      after = Object.fromEntries(res.pkColumns.map((c) => [c, last[res.fields.findIndex((f) => f.name === c)] ?? null]));
    }
    return all;
  };
  const deleteSelected = async () => {
    const rows = selection.map((i) => page?.rows[i]).filter((r): r is CellValue[] => Boolean(r));
    if (!rows.length) return;
    if (await deleteRows(ref, fields, pkColumns, rows)) {
      setSelection([]);
      refresh();
    }
  };
  const openInQuery = () => page && openTab('query', { connectionId, database, sessionId: crypto.randomUUID(), sql: page.sqlText.replace(/\$\d+/g, (m) => `/* ${m} */ NULL`) }, { reuse: false });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-border px-3">
        <Table2 size={14} strokeWidth={1.75} className={iconColorFor('table')} />
        <span className="font-mono text-[13px] font-medium">
          <span className="text-muted-foreground">{schema}.</span>
          {table}
        </span>
        <button type="button" className="rounded px-1.5 text-[11.5px] text-muted-foreground hover:bg-accent" onClick={() => openTab('table-structure', { connectionId, database, schema, table, section: 'columns' })}>
          Structure
        </button>
        {readOnly && (
          <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-env-staging-fg">
            <Lock size={11} strokeWidth={1.75} /> {meta?.readOnly ? 'Read-only connection' : 'No primary key — inline editing disabled'}
          </span>
        )}
        <div className="flex-1" />
        <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] font-medium hover:bg-accent disabled:opacity-50" disabled={readOnly || !page} onClick={() => buf.addInsert({})}>
          <Plus size={13} strokeWidth={1.75} /> Row
        </button>
        <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50" disabled={readOnly || selection.length === 0} onClick={() => void deleteSelected()}>
          <Trash2 size={13} strokeWidth={1.75} /> Delete {selection.length || ''}
        </button>
        <ExportMenu fields={fields} rows={page?.rows ?? []} selection={selection} table={{ schema, table }} pkColumns={pkColumns} suggestedName={`${schema}.${table}`} fetchAll={fetchAll} />
        <IconButton label="Open in query tab" size="sm" onClick={openInQuery} disabled={!page}>
          <SquareCode size={13} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={detail.open ? 'Hide row detail' : 'Show row detail'} size="sm" active={detail.open} onClick={() => detail.setOpen(!detail.open)}>
          {'{}'}
        </IconButton>
      </div>
      <FilterBar fields={fields.length ? fields : (rel.node?.columns ?? []).map((c) => ({ name: c.name, dataType: c.dataType, dataTypeID: 0, tableID: 0, columnID: 0 }))} filters={filters} sort={sort} onFilters={(f) => updateParams<'table-data'>(tab.id, { filters: f, page: { mode: 'keyset', after: null } })} onSort={(s) => updateParams<'table-data'>(tab.id, { sort: s, page: { mode: 'keyset', after: null } })} />
      {page && <div className="flex h-6 flex-none items-center gap-2 border-b border-border bg-muted/30 px-3 font-mono text-[11px] text-muted-foreground"><span className="truncate" title={page.sqlText}>{page.sqlText.replace(/\s+/g, ' ')}</span></div>}
      <InsertRows fields={fields} columns={rel.node?.columns} inserts={buf.buffer.inserts} onChange={buf.updateInsert} onRemove={buf.removeInsert} />
      <PanelGroup direction="horizontal" className="min-h-0 flex-1" onLayout={(sizes) => detail.open && sizes[0] !== undefined && detail.setRatio(sizes[0])}>
        <Panel minSize={30} defaultSize={detail.open ? detail.ratio : 100}>
          <ResultsGrid
            fields={fields}
            rows={displayRows}
            pkColumns={pkColumns}
            density={density}
            loading={rt.loading}
            error={rt.error}
            emptyText={filters.length ? 'No rows match · clear the filters' : 'Table is empty'}
            sort={sort}
            onSortChange={(s) => updateParams<'table-data'>(tab.id, { sort: s, page: { mode: 'keyset', after: null } })}
            onCellActivate={(r, c) => startEdit(r, c)}
            onSelectionChange={setSelection}
            onFocusRow={setFocusRow}
            linkCtx={{ connectionId, database, fromTabId: tab.id }}
            sessionKey={tab.id}
            sizingKey={`${connectionId}/${database}/${schema}.${table}`}
            editable={!readOnly}
            rowKeys={rowKeys}
            pendingCells={buf.pendingCells}
            errorRows={errorRows}
            deletedRows={buf.deletedRows}
            editingCell={editing}
            onEditStart={startEdit}
            onRevertCell={(r, c) => rowKeys[r] !== undefined && buf.revertCell(rowKeys[r]!, c)}
            onSetNull={(r, c) => page?.rows[r] && rowKeys[r] !== undefined && buf.setNull(rowKeys[r]!, page.rows[r]!, c)}
            renderEditor={(r, c) => {
              const col = fields.find((f) => f.name === c);
              const row = displayRows[r];
              if (!col || !row) return null;
              return <CellEditor dataType={col.dataType} value={row[fields.indexOf(col)] ?? null} initialText={editing?.initialText} onCommit={commitEdit} onCancel={() => setEditing(null)} />;
            }}
          />
        </Panel>
        {detail.open && (
          <>
            <PanelResizeHandle className="w-px bg-border data-[resize-handle-active]:bg-primary" />
            <Panel defaultSize={100 - detail.ratio} minSize={15}>
              <RowDetail
                fields={fields}
                row={focusRow !== null ? (displayRows[focusRow] ?? null) : null}
                title={focusRow !== null ? `Row ${focusRow + 1}` : 'Row'}
                view={detail.view}
                onViewChange={detail.setView}
                fieldsOpen={detail.fields}
                onFieldsOpenChange={detail.setFields}
                onClose={() => detail.setOpen(false)}
                linkCtx={{ connectionId, database, fromTabId: tab.id }}
              />
            </Panel>
          </>
        )}
      </PanelGroup>
      {buf.dirty && <EditFooter count={buf.count} applying={applying} error={applyError} previewSql={async () => (await pgterminal['rows:mutate']({ ...ref, ops: ops(), dryRun: true })).sqlText} onDiscard={() => { buf.clear(); setApplyError(null); setErrorRows(new Set()); }} onApply={() => void apply()} />}
      <Pager page={page} pageIndex={rt.pageIndex} limit={limit} keyset={keyset} count={rt.count} countLoading={rt.countLoading} loading={rt.loading} onPrev={prev} onNext={next} onFirst={first} onGoTo={goTo} onPageSize={(n) => void updateSettings({ gridPageSize: n as 50 | 100 | 200 | 500 | 1000 })} onRefresh={refresh} onExactCount={() => void loadCount(true)} />
    </div>
  );
}
