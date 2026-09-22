/** Apply / delete / close-guard flows for the table-data tab (no React). */
import { toast } from 'sonner';
import type { CellValue, FieldInfo, PgErrorInfo } from '@shared/types/query';
import type { MutateRowsResult, RowOp } from '@shared/types/rows';
import { qualify, quoteIdent } from '@shared/sql/quote';
import { pgui } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { confirm, useConfirmStore } from '@renderer/components/ui/ConfirmDialog';
import { quoteLiteral } from '@renderer/features/grid/gridModel';

export interface TableRef {
  connectionId: string;
  database: string;
  schema: string;
  table: string;
}

export interface ApplyOutcome {
  ok: boolean;
  error?: PgErrorInfo & { opIndex: number };
  result?: MutateRowsResult;
}

/** Runs the ops in one transaction; on prod a light confirmation with the dry-run SQL comes first. */
export async function applyOps(ref: TableRef, ops: RowOp[]): Promise<ApplyOutcome> {
  if (ops.length === 0) return { ok: true };
  const s = useStore.getState();
  const meta = s.connections[ref.connectionId];
  const needsConfirm = meta && s.settings.confirmOnEnv.includes(meta.env);
  if (needsConfirm) {
    const dry = await pgui['rows:mutate']({ ...ref, ops, dryRun: true });
    const ok = await askConfirm({
      title: `Apply ${ops.length} change${ops.length === 1 ? '' : 's'} to ${qualify(ref.schema, ref.table)}`,
      verb: 'Apply changes',
      variant: 'light',
      env: meta.env,
      connectionName: meta.name,
      summary: `${ops.filter((o) => o.op === 'update').length} updates · ${ops.filter((o) => o.op === 'insert').length} inserts · ${ops.filter((o) => o.op === 'delete').length} deletes, in one transaction.`,
      sql: dry.sqlText,
      typedName: s.settings.typedConfirmOnProd && meta.env === 'prod' && ops.some((o) => o.op === 'delete') && ops.length > 10 ? String(ops.length) : undefined
    });
    if (!ok) return { ok: false };
  }
  const result = await pgui['rows:mutate']({ ...ref, ops });
  if (!result.ok) return { ok: false, error: result.error, result };
  toast.success(`Applied ${ops.length} change${ops.length === 1 ? '' : 's'} · ${result.results?.reduce((n, r) => n + r.rowCount, 0) ?? 0} rows`);
  return { ok: true, result };
}

/** Confirm dialog as a promise; resolves false when dismissed. */
export function askConfirm(p: {
  title: string;
  verb: string;
  variant: 'destructive' | 'light' | 'neutral';
  env?: import('@shared/types/connection').EnvLabel;
  connectionName?: string;
  summary: string;
  details?: string[];
  sql: string;
  typedName?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const unsub = useConfirmStore.subscribe((st) => {
      if (st.spec === null && !done) {
        done = true;
        unsub();
        resolve(false);
      }
    });
    confirm({
      title: p.title,
      verb: p.verb,
      variant: p.variant,
      env: p.env,
      connectionName: p.connectionName,
      summary: p.summary,
      details: p.details,
      typedName: p.typedName,
      buildSql: () => p.sql,
      onConfirm: () => {
        done = true;
        unsub();
        resolve(true);
      }
    });
  });
}

/** Deletes the given rows right away (confirm first), returning true on success. */
export async function deleteRows(ref: TableRef, fields: FieldInfo[], pkColumns: string[], rows: CellValue[][]): Promise<boolean> {
  const s = useStore.getState();
  const meta = s.connections[ref.connectionId];
  const idx = pkColumns.map((c) => fields.findIndex((f) => f.name === c));
  if (!pkColumns.length || idx.some((i) => i < 0)) {
    toast.error('Cannot delete: the table has no primary key in this result');
    return false;
  }
  const ops: RowOp[] = rows.map((r) => {
    const pk: Record<string, CellValue> = {};
    pkColumns.forEach((c, j) => (pk[c] = r[idx[j] as number] ?? null));
    return { op: 'delete', pk };
  });
  const sample = rows.slice(0, 5).map((r) => `(${pkColumns.map((c, j) => `${quoteIdent(c)} = ${quoteLiteral(r[idx[j] as number] ?? null, fields[idx[j] as number]?.dataType)}`).join(' AND ')})`);
  const sql = `DELETE FROM ${qualify(ref.schema, ref.table)}\nWHERE ${sample.join('\n   OR ')}${rows.length > 5 ? `\n   OR … (${rows.length - 5} more)` : ''};`;
  const prod = meta?.env === 'prod';
  const ok = await askConfirm({
    title: `Delete ${rows.length} row${rows.length === 1 ? '' : 's'} from ${qualify(ref.schema, ref.table)}`,
    verb: `Delete ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    variant: 'destructive',
    env: meta?.env,
    connectionName: meta?.name,
    summary: 'The rows are deleted in one transaction. This cannot be undone.',
    sql,
    typedName: prod && s.settings.typedConfirmOnProd && rows.length > 10 ? String(rows.length) : undefined
  });
  if (!ok) return false;
  const result = await pgui['rows:mutate']({ ...ref, ops });
  if (!result.ok) {
    toast.error('Delete failed', { description: result.error?.hint ? `${result.error.message} — ${result.error.hint}` : result.error?.message });
    return false;
  }
  toast.success(`Deleted ${rows.length} row${rows.length === 1 ? '' : 's'}`);
  return true;
}

/** Close-guard prompt for pending edits: Apply & close / Discard / keep open. */
export function pendingCloseGuard(count: number, apply: () => Promise<boolean>): () => Promise<boolean> {
  return async () => {
    const choice = await new Promise<'apply' | 'discard' | 'cancel'>((resolve) => {
      let done = false;
      const unsub = useConfirmStore.subscribe((st) => {
        if (st.spec === null && !done) {
          done = true;
          unsub();
          resolve('cancel');
        }
      });
      confirm({
        title: `${count} pending change${count === 1 ? '' : 's'}`,
        verb: 'Discard & close',
        variant: 'light',
        summary: 'Apply them first, discard them, or keep the tab open.',
        buildSql: () => `-- ${count} unsaved cell/row change${count === 1 ? '' : 's'} in this tab`,
        onOpenInEditor: () => {
          done = true;
          unsub();
          resolve('apply');
        },
        onConfirm: () => {
          done = true;
          unsub();
          resolve('discard');
        }
      });
    });
    if (choice === 'apply') return apply();
    return choice === 'discard';
  };
}
