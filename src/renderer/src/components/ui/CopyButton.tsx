import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { copyText, resolveCopyValue } from '@renderer/lib/clipboard';

export interface CopyButtonProps {
  /** The text to copy, or a thunk for payloads worth building only on demand. */
  value: string | (() => string | Promise<string>);
  /** Shown beside the icon in the `text` variant; the idle wording, e.g. "Copy SQL". */
  label?: string;
  /** Announced and used as the tooltip for the icon variant. Defaults to `label` or "Copy". */
  title?: string;
  variant?: 'icon' | 'text';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  /** Called after a successful copy, for callers that need to close a menu or clear state. */
  onCopied?(): void;
}

const HOLD_MS = 1400;

/**
 * Copy action that confirms in place: the icon swaps to a tick for a moment, so the click has an
 * answer without a toast. Failures still toast, since there the user needs the reason.
 */
export function CopyButton({
  value,
  label,
  title,
  variant = 'icon',
  size = 'sm',
  disabled,
  className,
  onCopied
}: CopyButtonProps): JSX.Element {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const onClick = useCallback(async (): Promise<void> => {
    if (state === 'pending') return;
    setState('pending');
    let ok = false;
    try {
      ok = await copyText(await resolveCopyValue(value));
    } catch {
      ok = false;
    }
    if (!ok) {
      setState('idle');
      return;
    }
    setState('done');
    onCopied?.();
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), HOLD_MS);
  }, [onCopied, state, value]);

  const name = title ?? label ?? 'Copy';
  const iconSize = size === 'md' ? 13 : 12;
  const icon =
    state === 'pending' ? (
      <LoaderCircle size={iconSize} strokeWidth={2} className="animate-spin" />
    ) : state === 'done' ? (
      <Check size={iconSize} strokeWidth={2} className="animate-copy-pop text-success motion-reduce:animate-none" />
    ) : (
      <Copy size={iconSize} strokeWidth={1.75} />
    );

  return (
    <button
      type="button"
      aria-label={state === 'done' ? 'Copied' : name}
      title={state === 'done' ? 'Copied' : name}
      disabled={disabled || state === 'pending'}
      onClick={() => void onClick()}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'icon' && (size === 'md' ? 'h-7 w-7' : 'h-6 w-6'),
        variant === 'text' && (size === 'md' ? 'h-7 gap-1 px-2 text-[12px]' : 'h-6 gap-1 px-2 text-[11px]'),
        state === 'done' && 'text-success',
        className
      )}
    >
      {icon}
      {variant === 'text' && <span>{state === 'done' ? 'Copied' : (label ?? 'Copy')}</span>}
      {/* Announced for screen readers, which get no tick. */}
      <span className="sr-only" aria-live="polite">
        {state === 'done' ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}
