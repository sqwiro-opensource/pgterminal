import { useState } from 'react';
import { Eye, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import type { PgErrorInfo } from '@shared/types/query';

interface Props {
  count: number;
  applying: boolean;
  error: (PgErrorInfo & { opIndex: number }) | null;
  previewSql(): Promise<string>;
  onDiscard(): void;
  onApply(): void;
}

/** "⚠ n pending changes · Preview SQL · Discard · Apply ⌘S" plus the last error. */
export function EditFooter(p: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className="flex min-h-8 flex-none flex-wrap items-center gap-2 border-t border-pending/50 bg-pending/10 px-2 text-[12px]">
      <TriangleAlert size={13} strokeWidth={1.75} className="text-pending" />
      <span className="font-medium">
        {p.count} pending change{p.count === 1 ? '' : 's'}
      </span>
      {p.error && (
        <span className="truncate text-destructive" title={p.error.detail ?? p.error.message}>
          · op {p.error.opIndex + 1} failed{p.error.code ? ` (${p.error.code})` : ''}: {p.error.message}
          {p.error.hint ? ` — ${p.error.hint}` : ''}
        </span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 hover:bg-accent"
        onClick={() => void p.previewSql().then(setPreview)}
      >
        <Eye size={12} strokeWidth={1.75} /> Preview SQL
      </button>
      <button type="button" className="h-6 rounded border border-border bg-background px-2 hover:bg-accent" onClick={p.onDiscard} disabled={p.applying}>
        Discard
      </button>
      <button type="button" className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 font-medium text-primary-foreground disabled:opacity-50" onClick={p.onApply} disabled={p.applying}>
        {p.applying && <LoaderCircle size={12} strokeWidth={2} className="animate-spin" />}
        Apply <span className="kbd !bg-primary-foreground/20 !text-primary-foreground">⌘S</span>
      </button>
      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[720px] gap-0 p-0">
          <DialogHeader className="px-4 pb-2 pt-4">
            <DialogTitle className="text-[14px] font-semibold">Generated SQL (dry run)</DialogTitle>
          </DialogHeader>
          <pre className="m-4 mt-0 max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed">{preview}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
