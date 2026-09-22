import type { ReactNode } from 'react';
import { CircleAlert, Table2 } from 'lucide-react';
import { iconColorFor } from '@renderer/lib/objectIcons';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Skeleton } from '@renderer/components/ui/Skeleton';

/** Dense read-only grid used by every structure sub-tab. */
export function StructTable({ headers, children, className }: { headers: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-auto', className)}>
      <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="sticky top-0 z-[1] h-[26px] whitespace-nowrap border-b border-r border-grid-line bg-grid-header px-2 text-left font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, index }: { children: ReactNode; index: number }) {
  return <tr className={cn(index % 2 === 1 && 'bg-grid-alt')}>{children}</tr>;
}

export function Cell({ children, mono, muted, className, title }: { children?: ReactNode; mono?: boolean; muted?: boolean; className?: string; title?: string }) {
  return (
    <td
      title={title}
      className={cn(
        'h-7 max-w-[420px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-grid-line px-2',
        mono && 'font-mono text-[12px]',
        muted && 'text-muted-foreground',
        className
      )}
    >
      {children}
    </td>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'info' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    ok: 'bg-success/15 text-success',
    warn: 'bg-warning/20 text-env-staging-fg',
    info: 'bg-primary/12 text-link'
  } as const;
  return <span className={cn('inline-flex h-4 items-center rounded px-[5px] font-mono text-[10px] font-semibold', tones[tone])}>{children}</span>;
}

/** Clickable chip naming another relation. */
export function TargetChip({ schema, table, onClick, title }: { schema: string; table: string; onClick(): void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? `Open structure of ${schema}.${table}`}
      className="inline-flex h-[18px] max-w-full items-center gap-1 rounded border border-primary/20 bg-primary/[.08] px-1.5 font-mono text-[12px] text-link hover:bg-primary/[.14] hover:underline hover:decoration-dotted"
    >
      <Table2 size={12} strokeWidth={1.75} className={iconColorFor('table')} />
      <span className="text-muted-foreground">{schema}.</span>
      <span className="truncate">{table}</span>
    </button>
  );
}

export function LoadingRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="h-7 border-b border-r border-grid-line px-2">
              <Skeleton className="h-3 w-[70%]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?(): void }) {
  return (
    <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px]">
      <CircleAlert size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 break-words">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded border border-border px-2 py-0.5 text-[12px] hover:bg-accent">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">{children}</div>;
}
