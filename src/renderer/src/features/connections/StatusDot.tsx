import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { ConnectionStatus } from '../../store';

/** Green = connected, amber pulse = connecting, ring = idle, red = error. */
export function StatusDot({ state, className }: { state: ConnectionStatus['state']; className?: string }): JSX.Element {
  return (
    <span
      aria-label={state}
      className={cn(
        'inline-block h-2 w-2 flex-none rounded-full',
        state === 'connected' && 'bg-success',
        state === 'connecting' && 'bg-warning animate-pulse2',
        state === 'error' && 'bg-destructive',
        state === 'idle' && 'border-[1.5px] border-muted-foreground',
        className
      )}
    />
  );
}
