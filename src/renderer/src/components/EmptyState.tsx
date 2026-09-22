import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Primary affordance, e.g. "Add row" or "Clear filters". */
  action?: { label: string; onClick(): void };
  secondary?: { label: string; onClick(): void };
  className?: string;
  /** Compact variant for panels and popovers. */
  dense?: boolean;
}

/** The single empty-state surface: icon, title, one line of guidance, at most two actions. */
export function EmptyState({ title, description, icon, action, secondary, className, dense }: EmptyStateProps): JSX.Element {
  const Icon = icon ?? Inbox;
  if (dense) {
    return (
      <div className={cn('flex flex-col items-start gap-1 p-2 text-[12px] text-muted-foreground', className)}>
        <span>{title}</span>
        {description && <span className="text-[11px]">{description}</span>}
        {action && (
          <button type="button" onClick={action.onClick} className="text-[11px] font-medium text-link underline-offset-2 hover:underline">
            {action.label}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-2 p-6 text-center', className)}>
      <Icon size={20} strokeWidth={1.5} className="text-muted-foreground/60" />
      <div className="text-[13px] font-medium">{title}</div>
      {description && <div className="max-w-sm text-[12px] leading-snug text-muted-foreground">{description}</div>}
      {(action || secondary) && (
        <div className="mt-1 flex items-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex h-7 items-center rounded border border-transparent bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground hover:brightness-110"
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="inline-flex h-7 items-center rounded border border-border bg-background px-2.5 text-[12.5px] hover:bg-accent"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
