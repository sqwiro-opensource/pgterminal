import { useState } from 'react';
import { Copy, LoaderCircle } from 'lucide-react';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import type { CellValue, FieldInfo, PgErrorInfo } from '@shared/types/query';
import { classifyType } from '@renderer/lib/format';
import { toMutationSet, updatePreviewSql, type RowDiff } from './documentModel';

export interface SaveDiffSheetProps {
  open: boolean;
  schema: string;
  table: string;
  fields: FieldInfo[];
  diff: RowDiff[];
  pk: Record<string, CellValue>;
  error: PgErrorInfo | null;
  onCancel(): void;
  onConfirm(): Promise<boolean>;
}

function show(v: CellValue, dataType: string): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v, null, classifyType(dataType) === 'json' ? 1 : 0);
  return String(v);
}

/** Old → new per changed column plus the parameterised UPDATE that will run. */
export function SaveDiffSheet(p: SaveDiffSheetProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const set = toMutationSet(p.diff, p.fields);
  const sql = updatePreviewSql(p.schema, p.table, set, p.pk);
  const typeOf = (c: string): string => p.fields.find((f) => f.name === c)?.dataType ?? 'text';
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && !busy && p.onCancel()}>
      <DialogContent className="max-w-[720px] gap-0 p-0">
        <DialogHeader className="px-4 pb-2 pt-4">
          <DialogTitle className="text-[14px]">Save {p.diff.length} change{p.diff.length === 1 ? '' : 's'} to {p.schema}.{p.table}</DialogTitle>
          <DialogDescription className="text-[12px]">Values are sent as parameters; jsonb columns as JSON text. NULL stays NULL.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto px-4">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1 pr-2">Column</th>
                <th className="py-1 pr-2">Before</th>
                <th className="py-1">After</th>
              </tr>
            </thead>
            <tbody>
              {p.diff.map((d) => (
                <tr key={d.column} className="border-t border-grid-line align-top">
                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                    {d.column}
                    <div className="text-[10px]">{typeOf(d.column)}</div>
                  </td>
                  <td className="max-w-[260px] whitespace-pre-wrap break-all py-1 pr-2 font-mono text-[11.5px] text-muted-foreground line-through decoration-destructive/60">
                    {show(d.from, typeOf(d.column))}
                  </td>
                  <td className="max-w-[260px] whitespace-pre-wrap break-all py-1 font-mono text-[11.5px]">{show(d.to, typeOf(d.column))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="relative mt-3 rounded border border-border bg-muted/40 p-2 font-mono text-[11.5px]">
            <pre className="whitespace-pre-wrap">{sql}</pre>
            <button type="button" className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => void navigator.clipboard.writeText(sql)}>
              <Copy size={12} strokeWidth={1.75} />
            </button>
          </div>
          {p.error && (
            <div className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-[12px]">
              {p.error.code && <span className="mr-2 font-mono text-[11px] text-destructive">{p.error.code}</span>}
              {p.error.message}
              {p.error.detail && <div className="text-muted-foreground">{p.error.detail}</div>}
              {p.error.hint && <div className="text-muted-foreground">Hint: {p.error.hint}</div>}
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={p.onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || p.diff.length === 0}
            onClick={() => {
              setBusy(true);
              void p.onConfirm().finally(() => setBusy(false));
            }}
          >
            {busy && <LoaderCircle size={13} className="mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
