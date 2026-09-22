import * as RCM from '@radix-ui/react-context-menu';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

export const ContextMenu = RCM.Root;
export const ContextMenuTrigger = RCM.Trigger;

export const ContextMenuContent = forwardRef<ElementRef<typeof RCM.Content>, ComponentPropsWithoutRef<typeof RCM.Content>>(
  function ContextMenuContent({ className, ...props }, ref) {
    return (
      <RCM.Portal>
        <RCM.Content
          ref={ref}
          className={cn(
            'z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 text-[12.5px] text-popover-foreground shadow-md',
            'animate-in fade-in-0 zoom-in-95',
            className
          )}
          {...props}
        />
      </RCM.Portal>
    );
  }
);

export const ContextMenuItem = forwardRef<
  ElementRef<typeof RCM.Item>,
  ComponentPropsWithoutRef<typeof RCM.Item> & { danger?: boolean; shortcut?: string; badge?: ReactNode }
>(function ContextMenuItem({ className, danger, shortcut, badge, children, ...props }, ref) {
  return (
    <RCM.Item
      ref={ref}
      className={cn(
        'flex h-[26px] cursor-default select-none items-center gap-2 rounded px-2 outline-none',
        'data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger && 'text-destructive',
        className
      )}
      {...props}
    >
      <span className="flex-1 truncate">{children}</span>
      {badge}
      {shortcut && <span className="kbd">{shortcut}</span>}
    </RCM.Item>
  );
});

export function ContextMenuSeparator(): JSX.Element {
  return <RCM.Separator className="my-1 h-px bg-border" />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <RCM.Label className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{children}</RCM.Label>;
}

/** Declarative item list so callers can build menus from data. */
export interface MenuEntry {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Why the item is disabled; rendered muted after the label. */
  reason?: string;
  danger?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
  /** Small tag shown after the label (e.g. DX / DDL / CF action class). */
  badge?: ReactNode;
  /** Sub-menu items; when present `onSelect` is ignored. */
  children?: MenuEntry[];
}

const subTriggerClass =
  'flex h-[26px] cursor-default select-none items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-accent data-[state=open]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export function MenuEntries({ entries }: { entries: MenuEntry[] }): JSX.Element {
  return (
    <>
      {entries.map((e, i) => (
        <span key={`${e.label}-${i}`} className="contents">
          {e.separatorBefore && <ContextMenuSeparator />}
          {e.children ? (
            <RCM.Sub>
              <RCM.SubTrigger className={subTriggerClass} disabled={e.disabled}>
                <span className="flex-1 truncate">{e.label}</span>
                {e.badge}
                <span className="text-muted-foreground">▸</span>
              </RCM.SubTrigger>
              <RCM.Portal>
                <RCM.SubContent
                  className="z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 text-[12.5px] text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
                  sideOffset={4}
                >
                  <MenuEntries entries={e.children} />
                </RCM.SubContent>
              </RCM.Portal>
            </RCM.Sub>
          ) : (
            <ContextMenuItem onSelect={e.onSelect} disabled={e.disabled} danger={e.danger} shortcut={e.shortcut} badge={e.badge}>
              {e.label}
              {e.disabled && e.reason && <span className="ml-2 text-[10.5px] text-muted-foreground">{e.reason}</span>}
            </ContextMenuItem>
          )}
        </span>
      ))}
    </>
  );
}
