import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Copy, LoaderCircle, SquarePen, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import type { EnvLabel } from '@shared/types/connection';

export type ConfirmVariant = 'destructive' | 'light' | 'neutral';

export interface ConfirmOption {
  key: string;
  label: string;
  checked: boolean;
}

/** Everything the confirm dialog needs; opened via `confirm(spec)` from any action (no React context needed). */
export interface ConfirmSpec {
  title: string;
  /** Button label, e.g. "Drop table". */
  verb: string;
  variant: ConfirmVariant;
  env?: EnvLabel;
  connectionName?: string;
  /** Human sentence with concrete numbers. */
  summary: ReactNode;
  /** Extra lines (dependants, notes). */
  details?: string[];
  options?: ConfirmOption[];
  /** Builds the SQL shown (and executed) from the current option state. */
  buildSql(options: Record<string, boolean>): string;
  /** When set, the user must type this exact text before the verb button enables. */
  typedName?: string;
  onOpenInEditor?(sql: string): void;
  onConfirm(sql: string, options: Record<string, boolean>): Promise<void> | void;
}

interface ConfirmState {
  spec: ConfirmSpec | null;
  open(spec: ConfirmSpec): void;
  close(): void;
}

export const useConfirmStore = create<ConfirmState>()((set) => ({
  spec: null,
  open: (spec) => set({ spec }),
  close: () => set({ spec: null })
}));

/** Imperative entry point used by tree actions and, later, grid/document actions. */
export function confirm(spec: ConfirmSpec): void {
  useConfirmStore.getState().open(spec);
}

/** Mount once (the catalog tree does) to render the active confirmation. */
export function ConfirmDialogHost(): JSX.Element {
  const spec = useConfirmStore((s) => s.spec);
  const close = useConfirmStore((s) => s.close);
  return (
    <Dialog open={spec !== null} onOpenChange={(open) => !open && close()}>
      {spec && <ConfirmBody key={spec.title + spec.verb} spec={spec} onClose={close} />}
    </Dialog>
  );
}

function ConfirmBody({ spec, onClose }: { spec: ConfirmSpec; onClose(): void }): JSX.Element {
  const [options, setOptions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((spec.options ?? []).map((o) => [o.key, o.checked]))
  );
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sql = useMemo(() => spec.buildSql(options), [spec, options]);
  const typedOk = !spec.typedName || typed.trim() === spec.typedName;

  useEffect(() => setError(null), [sql]);

  const run = async (): Promise<void> => {
    if (!typedOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await spec.onConfirm(sql, options);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const tone =
    spec.variant === 'destructive' ? 'text-destructive' : spec.variant === 'light' ? 'text-warning' : 'text-primary';

  return (
    <DialogContent className="max-w-[560px] gap-0 p-0" onKeyDown={(e) => e.key === 'Enter' && typedOk && !busy && void run()}>
      <DialogHeader className="px-4 pb-2 pt-4">
        <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
          <TriangleAlert size={16} strokeWidth={1.75} className={tone} />
          <span className="flex-1 truncate">{spec.title}</span>
          {spec.connectionName && <span className="text-[11.5px] font-normal text-muted-foreground">{spec.connectionName}</span>}
          {spec.env && <span className={cn('env-badge', spec.env)}>{spec.env}</span>}
        </DialogTitle>
        <DialogDescription className="text-[12.5px] text-foreground">{spec.summary}</DialogDescription>
      </DialogHeader>

      <div className="space-y-3 px-4 pb-3 text-[12.5px]">
        {spec.details && spec.details.length > 0 && (
          <ul className="space-y-0.5 text-muted-foreground">
            {spec.details.map((d) => (
              <li key={d} className="truncate">· {d}</li>
            ))}
          </ul>
        )}
        {spec.options && spec.options.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {spec.options.map((o) => (
              <label key={o.key} className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  checked={options[o.key] ?? false}
                  onChange={(e) => setOptions((prev) => ({ ...prev, [o.key]: e.target.checked }))}
                />
                {o.label}
              </label>
            ))}
          </div>
        )}
        <div className="relative rounded-md border border-border bg-muted/40">
          <pre className="max-h-40 overflow-auto p-3 pr-16 font-mono text-[12px] leading-relaxed">{sql}</pre>
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(sql).then(() => toast.success('SQL copied'))}
          >
            <Copy size={12} strokeWidth={1.75} /> Copy
          </button>
        </div>
        {spec.typedName && (
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap">
              Type <code className="rounded bg-muted px-1 font-mono">{spec.typedName}</code> to confirm:
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring"
              spellCheck={false}
            />
          </label>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
        )}
      </div>

      <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onClose} disabled={busy}>
          Cancel <span className="kbd ml-1">esc</span>
        </Button>
        {spec.onOpenInEditor && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[12px]"
            disabled={busy}
            onClick={() => {
              spec.onOpenInEditor?.(sql);
              onClose();
            }}
          >
            <SquarePen size={13} strokeWidth={1.75} /> Open in editor
          </Button>
        )}
        <Button
          size="sm"
          className={cn(
            'h-7 gap-1 text-[12px]',
            spec.variant === 'destructive' && 'bg-destructive text-white hover:bg-destructive/90',
            spec.variant === 'light' && 'bg-warning text-[hsl(222_20%_12%)] hover:bg-warning/90'
          )}
          disabled={!typedOk || busy}
          onClick={() => void run()}
        >
          {busy && <LoaderCircle size={13} strokeWidth={2} className="animate-spin" />}
          {spec.verb}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
