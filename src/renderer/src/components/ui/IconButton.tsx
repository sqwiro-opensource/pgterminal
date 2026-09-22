import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Optional shortcut rendered in the tooltip. */
  shortcut?: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

/** 28×28 (md) / 22×22 (sm) icon-only button with tooltip and aria-label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', active, className, children, ...rest },
  ref
) {
  return (
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={cn(
            'no-drag inline-flex items-center justify-center rounded-[5px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            size === 'md' ? 'h-7 w-7' : 'h-[22px] w-[22px]',
            active && 'bg-accent text-foreground',
            className
          )}
          {...rest}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2 px-2 py-1 text-[11.5px]">
        {label}
        {shortcut && <span className="kbd">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
});
