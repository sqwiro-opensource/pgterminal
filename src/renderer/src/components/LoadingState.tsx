import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Skeleton } from './ui/Skeleton';

/** Skeleton lines for a panel body; never a full-screen spinner overlay. */
export function LoadingState({ lines = 3, className }: { lines?: number; className?: string }): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2 p-3', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  );
}

/**
 * A 1 px indeterminate bar for refreshes of already-loaded panels: the state rules ask for
 * a progress line rather than a second skeleton once data is on screen.
 */
export function RefreshBar({ active, className }: { active: boolean; className?: string }): JSX.Element | null {
  if (!active) return null;
  return (
    <div className={cn('h-px w-full overflow-hidden bg-transparent', className)}>
      <div className="h-px w-1/3 animate-pulse bg-primary/70" />
    </div>
  );
}
