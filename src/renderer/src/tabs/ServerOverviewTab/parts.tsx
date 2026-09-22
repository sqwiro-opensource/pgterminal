import type { ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

export function Panel({ title, count, right, children, error, onRetry, className }: { title: string; count?: number | string; right?: ReactNode; children: ReactNode; error?: string | null; onRetry?(): void; className?: string }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-lg border border-border bg-card', className)}>
      <header className="flex h-8 flex-none items-center gap-2 border-b border-border px-3">
        <h3 className="text-[12px] font-semibold text-muted-foreground">
          {title}
          {count !== undefined && <span className="ml-1.5 font-mono text-[11px] font-normal">({count})</span>}
        </h3>
        <div className="flex-1" />
        {right}
      </header>
      {error ? (
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-destructive">
          <CircleAlert size={14} strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate" title={error}>{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-foreground hover:bg-accent">
              <RefreshCw size={12} strokeWidth={1.75} /> Retry
            </button>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      )}
    </section>
  );
}

export function Kpi({ label, value, sub, percent, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; percent?: number | null; tone?: 'default' | 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[.05em] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 font-mono text-[20px] font-semibold leading-tight', tone === 'ok' && 'text-success', tone === 'warn' && 'text-warning', tone === 'bad' && 'text-destructive')}>{value}</div>
      {percent !== undefined && percent !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-muted">
          <div className={cn('h-full rounded', tone === 'bad' ? 'bg-destructive' : tone === 'warn' ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
      )}
      {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'info'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'ok' && 'bg-success/15 text-success',
        tone === 'warn' && 'bg-warning/20 text-env-staging-fg',
        tone === 'bad' && 'bg-destructive/15 text-destructive',
        tone === 'info' && 'bg-primary/12 text-link',
        className
      )}
    >
      {children}
    </span>
  );
}

export function SkeletonLines({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${70 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">{children}</div>;
}

export function stateTone(state: string | null): 'ok' | 'warn' | 'bad' | 'muted' {
  if (state === 'active') return 'ok';
  if (state === 'idle in transaction') return 'warn';
  if (state === 'idle in transaction (aborted)') return 'bad';
  return 'muted';
}
