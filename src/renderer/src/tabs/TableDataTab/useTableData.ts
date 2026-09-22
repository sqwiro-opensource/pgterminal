import { useCallback, useEffect, useRef } from 'react';
import type { Tab } from '@shared/types/workspace';
import type { CountResult, PageSpec, RowsPage } from '@shared/types/rows';
import type { CellValue, PgErrorInfo } from '@shared/types/query';
import { pgui } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { useTabRuntime } from '@renderer/tabs/useTab';
import { isKeysetSort } from './filterModel';

export interface TableDataRuntime {
  page: RowsPage | null;
  loading: boolean;
  error: PgErrorInfo | null;
  count: CountResult | null;
  countLoading: boolean;
  /** 0-based page number (keyset: number of "next" steps; offset: offset / limit). */
  pageIndex: number;
  fetchedAt: number;
  splitRatio: number;
}

const INIT: TableDataRuntime = { page: null, loading: false, error: null, count: null, countLoading: false, pageIndex: 0, fetchedAt: 0, splitRatio: 70 };

function keyOf(row: CellValue[] | undefined, page: RowsPage | null): Record<string, CellValue> | null {
  if (!row || !page) return null;
  const out: Record<string, CellValue> = {};
  for (const pk of page.pkColumns) {
    const i = page.fields.findIndex((f) => f.name === pk);
    out[pk] = row[i] ?? null;
  }
  return out;
}

function errorInfo(err: unknown): PgErrorInfo {
  return { message: err instanceof Error ? err.message : String(err) };
}

/** Server-side paging for a table-data tab; state lives in tabRuntime so switching tabs keeps it. */
export function useTableData(tab: Tab<'table-data'>) {
  const [rt, update] = useTabRuntime<TableDataRuntime>(tab.id, INIT);
  const limit = useStore((s) => s.settings.gridPageSize) || 100;
  const { connectionId, database, schema, table, filters, sort, page } = tab.params;
  const seq = useRef(0);
  const paramsKey = JSON.stringify({ filters, sort, page, limit });

  const fetchPage = useCallback(
    async (spec: PageSpec, pageIndex: number) => {
      const n = ++seq.current;
      update({ loading: true, error: null });
      try {
        const res = await pgui['rows:fetch']({ connectionId, database, schema, table, filters, sort, limit, page: spec });
        if (n !== seq.current) return;
        update({ page: res, loading: false, pageIndex, fetchedAt: Date.now() });
      } catch (err) {
        if (n !== seq.current) return;
        update({ loading: false, error: errorInfo(err) });
      }
    },
    [connectionId, database, schema, table, filters, sort, limit, update]
  );

  // Initial load and reload whenever params change.
  useEffect(() => {
    const idx = page.mode === 'offset' ? Math.floor(page.offset / limit) : (useStore.getState().tabRuntime[tab.id] as TableDataRuntime | undefined)?.pageIndex ?? 0;
    void fetchPage(page, page.mode === 'keyset' && page.after === null && !page.before ? 0 : idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const loadCount = useCallback(
    async (exact: boolean) => {
      update({ countLoading: true });
      try {
        const count = await pgui['rows:count']({ connectionId, database, schema, table, filters, exact });
        update({ count, countLoading: false });
      } catch {
        update({ countLoading: false });
      }
    },
    [connectionId, database, schema, table, filters, update]
  );

  useEffect(() => {
    void loadCount(false);
  }, [loadCount]);

  const setPage = (spec: PageSpec) => useStore.getState().updateParams<'table-data'>(tab.id, { page: spec });
  const keyset = rt.page ? isKeysetSort(sort, rt.page.pkColumns) : page.mode === 'keyset';

  const next = () => {
    if (!rt.page?.hasMore) return;
    if (keyset) {
      const after = keyOf(rt.page.rows[rt.page.rows.length - 1], rt.page);
      if (after) {
        update({ pageIndex: rt.pageIndex + 1 });
        setPage({ mode: 'keyset', after, before: null });
      }
    } else setPage({ mode: 'offset', offset: (rt.pageIndex + 1) * limit });
  };
  const prev = () => {
    if (rt.pageIndex <= 0) return;
    if (keyset) {
      const before = keyOf(rt.page?.rows[0], rt.page);
      if (rt.pageIndex - 1 === 0 || !before) return void (update({ pageIndex: 0 }), setPage({ mode: 'keyset', after: null }));
      update({ pageIndex: rt.pageIndex - 1 });
      setPage({ mode: 'keyset', after: null, before });
    } else setPage({ mode: 'offset', offset: Math.max(0, (rt.pageIndex - 1) * limit) });
  };
  const first = () => {
    update({ pageIndex: 0 });
    setPage(keyset ? { mode: 'keyset', after: null } : { mode: 'offset', offset: 0 });
  };
  const goTo = (pageNo: number) => {
    const idx = Math.max(0, pageNo - 1);
    update({ pageIndex: idx });
    setPage({ mode: 'offset', offset: idx * limit });
  };
  const refresh = () => void fetchPage(page, rt.pageIndex).then(() => loadCount(Boolean(rt.count?.exact)));

  return { rt, update, limit, keyset, next, prev, first, goTo, refresh, loadCount };
}
