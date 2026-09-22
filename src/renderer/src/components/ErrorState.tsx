import { useState } from 'react';
import { CircleAlert, Copy, RefreshCw } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { PgErrorInfo } from '@shared/ipc';

export interface ErrorStateProps {
  /** A structured Postgres error, or a plain message. */
  error: PgErrorInfo | string;
  title?: string;
  onRetry?(): void;
  onClose?(): void;
  /** `card` sits inside a panel; `full` fills the tab body. */
  variant?: 'card' | 'full';
  className?: string;
}

function asError(e: PgErrorInfo | string): PgErrorInfo {
  return typeof e === 'string' ? { message: e } : e;
}

/** Copyable text for an error, used by the Copy button and the toast fallback. */
export function errorToText(e: PgErrorInfo | string): string {
  const err = asError(e);
  return [
    err.code ? `SQLSTATE ${err.code}` : null,
    err.message,
    err.detail ? `Detail: ${err.detail}` : null,
    err.hint ? `Hint: ${err.hint}` : null,
    err.where ? `Where: ${err.where}` : null
  ]
    .filter(Boolean)
    .join('\n');
}

/** The single error surface: severity, SQLSTATE, message, detail, hint, Copy and Retry. */
export function ErrorState({ error, title, onRetry, onClose, variant = 'card', className }: ErrorStateProps): JSX.Element {
  const err = asError(error);
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    navigator.clipboard.writeText(errorToText(err)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };

  const body = (
    <div
      className={cn(
        'flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[12.5px]',
        variant === 'full' && 'max-w-xl',
        className
      )}
    >
      <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 flex-none text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {title && <span className="mr-2">{title}</span>}
          {err.code && <span className="mr-2 font-mono text-[11px] text-destructive">{err.code}</span>}
          <span className="break-words">{err.message}</span>
        </div>
        {err.detail && <div className="mt-1 break-words text-muted-foreground">{err.detail}</div>}
        {err.hint && <div className="mt-1 break-words text-muted-foreground">Hint: {err.hint}</div>}
        <div className="mt-2 flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11.5px] hover:bg-accent"
            >
              <RefreshCw size={12} strokeWidth={1.75} />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11.5px] hover:bg-accent"
          >
            <Copy size={12} strokeWidth={1.75} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-6 items-center rounded border border-border bg-background px-2 text-[11.5px] hover:bg-accent"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (variant === 'full') return <div className="flex h-full items-center justify-center p-6">{body}</div>;
  return body;
}
