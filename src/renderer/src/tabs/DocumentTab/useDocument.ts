import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DocTarget } from '@shared/types/doclink';
import type { CellValue, FieldInfo, PgErrorInfo } from '@shared/types/query';
import { pgui } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { docLinks } from '@renderer/features/doclink/docLinksService';
import { buildUpdateOp, cellsEqual, rowToObject, type Row } from './documentModel';

export interface DocumentState {
  target: DocTarget;
  fields: FieldInfo[];
  pkColumns: string[];
  row: Row | null;
  draft: Row;
  loading: boolean;
  error: PgErrorInfo | null;
  notFound: boolean;
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  saveError: PgErrorInfo | null;
}

export interface DocumentActions {
  reload(): Promise<void>;
  setDraft(next: Row): void;
  setColumn(column: string, value: CellValue): void;
  discard(): void;
  save(): Promise<boolean>;
  remove(): Promise<boolean>;
  pk(): Record<string, CellValue>;
}

/** Loads the target row by its key column, keeps a draft, saves through rows:mutate. */
export function useDocument(tabId: string, connectionId: string, database: string, target: DocTarget): [DocumentState, DocumentActions] {
  const setDirtyTab = useStore((s) => s.setDirty);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [pkColumns, setPk] = useState<string[]>([]);
  const [row, setRow] = useState<Row | null>(null);
  const [draft, setDraftState] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PgErrorInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<PgErrorInfo | null>(null);
  const seq = useRef(0);

  const targetKey = `${target.schema}.${target.table}/${target.keyColumn}=${target.keyValue}`;

  const reload = useCallback(async (): Promise<void> => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const page = await pgui['rows:fetch']({
        connectionId,
        database,
        schema: target.schema,
        table: target.table,
        filters: [{ column: target.keyColumn, op: 'eq', value: target.keyValue }],
        sort: [],
        limit: 1,
        page: { mode: 'offset', offset: 0 }
      });
      if (my !== seq.current) return;
      const first = page.rows[0];
      setFields(page.fields);
      setPk(page.pkColumns);
      if (!first) {
        setRow(null);
        setDraftState({});
        setNotFound(true);
      } else {
        const obj = rowToObject(page.fields, first);
        setRow(obj);
        setDraftState({ ...obj });
      }
      setSaveError(null);
    } catch (e) {
      if (my !== seq.current) return;
      setError({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [connectionId, database, target.schema, target.table, target.keyColumn, target.keyValue]);

  useEffect(() => {
    void reload();
  }, [reload, targetKey]);

  const dirty = useMemo(() => {
    if (!row) return false;
    return fields.some((f) => !cellsEqual(row[f.name] ?? null, draft[f.name] ?? null));
  }, [row, draft, fields]);

  useEffect(() => {
    setDirtyTab(tabId, dirty);
  }, [dirty, tabId, setDirtyTab]);

  const pk = useCallback((): Record<string, CellValue> => {
    if (!row) return {};
    const cols = pkColumns.length > 0 ? pkColumns : [target.keyColumn];
    const out: Record<string, CellValue> = {};
    for (const c of cols) out[c] = row[c] ?? null;
    return out;
  }, [row, pkColumns, target.keyColumn]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!row) return false;
    const op = buildUpdateOp(row, draft, fields, pk());
    if (!op) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await pgui['rows:mutate']({ connectionId, database, schema: target.schema, table: target.table, ops: [op] });
      if (!res.ok || !res.results) {
        setSaveError(res.error ?? { message: 'Save failed' });
        return false;
      }
      const r = res.results[0];
      if (r && r.rowCount === 0) {
        setSaveError({ message: 'Row changed on the server (0 rows updated). Reload and retry.', code: 'PGUI_CONFLICT' });
        return false;
      }
      const returned = r?.returning?.[0];
      const nextFields = r?.fields ?? fields;
      const obj = returned ? rowToObject(nextFields, returned) : { ...draft };
      setFields(nextFields);
      setRow(obj);
      setDraftState({ ...obj });
      setSavedAt(Date.now());
      docLinks.clearCache(connectionId, database);
      toast.success(`Saved ${target.table}/${target.keyValue}`);
      return true;
    } catch (e) {
      setSaveError({ message: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setSaving(false);
    }
  }, [row, draft, fields, pk, connectionId, database, target.schema, target.table, target.keyValue]);

  const remove = useCallback(async (): Promise<boolean> => {
    if (!row) return false;
    const res = await pgui['rows:mutate']({ connectionId, database, schema: target.schema, table: target.table, ops: [{ op: 'delete', pk: pk() }] });
    if (!res.ok) throw new Error(res.error?.message ?? 'Delete failed');
    docLinks.clearCache(connectionId, database);
    return true;
  }, [row, pk, connectionId, database, target.schema, target.table]);

  const actions: DocumentActions = useMemo(
    () => ({
      reload,
      setDraft: (next) => setDraftState(next),
      setColumn: (column, value) => setDraftState((d) => ({ ...d, [column]: value })),
      discard: () => setDraftState(row ? { ...row } : {}),
      save,
      remove,
      pk
    }),
    [reload, row, save, remove, pk]
  );

  return [{ target, fields, pkColumns, row, draft, loading, error, notFound, dirty, saving, savedAt, saveError }, actions];
}
