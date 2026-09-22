import { Copy, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { PgErrorInfo } from '@shared/types/query';
import type { QueryMessage } from './queryRuntime';

export interface MessagesPanelProps {
  messages: QueryMessage[];
  onShowInEditor(error: PgErrorInfo): void;
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}

function ErrorCard({ m, onShowInEditor }: { m: QueryMessage; onShowInEditor(e: PgErrorInfo): void }): JSX.Element {
  const e = m.error ?? { message: m.text };
  const text = [e.message, e.detail && `DETAIL: ${e.detail}`, e.hint && `HINT: ${e.hint}`].filter(Boolean).join('\n');
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/[.06] p-2.5 text-[12.5px]">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-destructive/15 px-2 py-px text-[10.5px] font-semibold uppercase tracking-wide text-destructive">{e.severity ?? 'ERROR'}</span>
        {e.code && <span className="rounded bg-muted px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">SQLSTATE {e.code}</span>}
        {m.statementIndex !== undefined && <span className="text-[11px] text-muted-foreground">statement {m.statementIndex + 1}</span>}
        {e.line && <span className="font-mono text-[11px] text-muted-foreground">Ln {e.line}, Col {e.col ?? 1}</span>}
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{time(m.ts)}</span>
      </div>
      <div className="mt-1.5 font-medium">{e.message}</div>
      {e.detail && <div className="mt-0.5 text-muted-foreground">{e.detail}</div>}
      {e.hint && (
        <div className="mt-0.5 text-muted-foreground">
          <span className="font-semibold">Hint:</span> {e.hint}
        </div>
      )}
      {(e.table || e.column || e.constraint) && (
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          {e.schema && `${e.schema}.`}
          {e.table}
          {e.column && ` · ${e.column}`}
          {e.constraint && ` · ${e.constraint}`}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        {e.line && (
          <button type="button" onClick={() => onShowInEditor(e)} className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11.5px] hover:bg-accent">
            <Crosshair size={12} strokeWidth={1.75} /> Show in editor
          </button>
        )}
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success('Copied'))}
          className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11.5px] hover:bg-accent"
        >
          <Copy size={12} strokeWidth={1.75} /> Copy
        </button>
      </div>
    </div>
  );
}

export function MessagesPanel({ messages, onShowInEditor }: MessagesPanelProps): JSX.Element {
  if (messages.length === 0) {
    return <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">No messages yet.</div>;
  }
  return (
    <div className="h-full overflow-auto p-2">
      <ul className="space-y-1.5">
        {messages.map((m, i) =>
          m.kind === 'error' ? (
            <li key={i}>
              <ErrorCard m={m} onShowInEditor={onShowInEditor} />
            </li>
          ) : (
            <li key={i} className={cn('flex items-center gap-2 px-1 font-mono text-[12px]', m.kind === 'notice' ? 'text-warning' : 'text-muted-foreground')}>
              <span className="text-[10.5px] opacity-70">{time(m.ts)}</span>
              <span className="text-foreground/90">{m.text}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
