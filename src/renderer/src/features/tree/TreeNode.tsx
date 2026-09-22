import { forwardRef, type CSSProperties, type MouseEvent } from 'react';
import { ChevronRight, CircleAlert, LoaderCircle, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/tooltip';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuEntries, type MenuEntry } from '@renderer/components/ui/ContextMenu';
import { iconColorFor, iconFor as iconForKind, type IconKind } from '@renderer/lib/objectIcons';
import type { TreeRow } from './treeModel';

/** Rows that are pure layout (group headers, "N more", hints) carry no object icon. */
function isIconKind(kind: TreeRow['kind']): kind is IconKind {
  return kind !== 'group' && kind !== 'more' && kind !== 'hint';
}

function iconFor(row: TreeRow): LucideIcon | null {
  if (!isIconKind(row.kind)) return null;
  return iconForKind(row.kind, { expanded: row.expanded, pk: row.pk });
}

function iconColor(row: TreeRow): string {
  if (!isIconKind(row.kind)) return 'text-muted-foreground';
  return iconColorFor(row.kind, { pk: row.pk });
}

export interface TreeNodeProps {
  row: TreeRow;
  style: CSSProperties;
  selected: boolean;
  focused: boolean;
  menu: MenuEntry[];
  onSelect(row: TreeRow): void;
  onToggle(row: TreeRow, force?: boolean): void;
  onPrimary(row: TreeRow): void;
}

export const TreeNode = forwardRef<HTMLDivElement, TreeNodeProps>(function TreeNode(
  { row, style, selected, focused, menu, onSelect, onToggle, onPrimary },
  ref
) {
  const Icon = iconFor(row);
  const isGroup = row.kind === 'group';
  const dim = row.kind === 'hint' || row.kind === 'more' || (row.kind === 'database' && !row.isOpen);

  const onChevron = (e: MouseEvent) => {
    e.stopPropagation();
    if (row.hasChildren) onToggle(row);
  };

  const body = (
    <div
      ref={ref}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      data-key={row.key}
      style={{ ...style, paddingLeft: isGroup ? 6 : 6 + row.depth * 16 }}
      onClick={() => onSelect(row)}
      onDoubleClick={() => onPrimary(row)}
      className={cn(
        'group/row absolute left-0 top-0 flex h-6 w-full cursor-default select-none items-center gap-[5px] whitespace-nowrap pr-2 text-[13px] outline-none',
        isGroup && 'h-6 text-muted-foreground',
        !isGroup && 'hover:bg-accent',
        selected && 'bg-accent',
        focused && 'ring-2 ring-inset ring-ring',
        dim && 'text-muted-foreground'
      )}
    >
      {row.isActive && <span className="absolute bottom-0.5 left-0 top-0.5 w-0.5 bg-primary" />}
      {isGroup && (
        <span
          className={cn('absolute bottom-1 left-0 top-1 w-[3px] rounded-r-sm', envBar(row))}
        />
      )}
      {/* chevron slot */}
      <span className="inline-flex h-4 w-4 flex-none items-center justify-center text-muted-foreground" onClick={onChevron}>
        {row.loading ? (
          <LoaderCircle size={12} strokeWidth={2} className="animate-spin" />
        ) : row.error ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="inline-flex text-destructive">
                <CircleAlert size={12} strokeWidth={2} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[320px] text-[12px]">{row.error}</TooltipContent>
          </Tooltip>
        ) : row.hasChildren ? (
          <ChevronRight size={14} strokeWidth={1.75} className={cn('transition-transform', row.expanded && 'rotate-90')} />
        ) : null}
      </span>
      {row.kind === 'server' && <StatusDot status={row.status} />}
      {Icon && <Icon size={14} strokeWidth={1.75} className={cn('flex-none', dim ? 'text-muted-foreground' : iconColor(row))} />}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          isGroup && 'text-[10px] font-semibold uppercase tracking-[.06em]',
          row.kind === 'database' && row.isOpen && 'font-medium',
          row.matches && 'text-foreground'
        )}
      >
        {row.matches ? <mark className="rounded-sm bg-warning/30 text-inherit">{row.label}</mark> : row.label}
      </span>
      {row.readOnly && <Lock size={12} strokeWidth={1.75} className="flex-none text-muted-foreground" />}
      {row.env && row.kind === 'server' && <span className={cn('env-badge', row.env)}>{row.env}</span>}
      {row.meta && <span className="flex-none font-mono text-[11px] text-muted-foreground">{row.meta}</span>}
    </div>
  );

  if (menu.length === 0) return body;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <MenuEntries entries={menu} />
      </ContextMenuContent>
    </ContextMenu>
  );
});

function envBar(row: TreeRow): string {
  switch (row.env) {
    case 'prod':
      return 'bg-env-prod-bar';
    case 'staging':
      return 'bg-env-staging-bar';
    case 'dev':
      return 'bg-env-dev-bar';
    default:
      return 'bg-env-local-bar';
  }
}

function StatusDot({ status }: { status: TreeRow['status'] }): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-2 w-2 flex-none rounded-full',
        status === 'on' && 'bg-success',
        status === 'busy' && 'animate-pulse2 bg-warning',
        status === 'err' && 'bg-destructive',
        (status === 'off' || !status) && 'border-[1.5px] border-muted-foreground bg-transparent'
      )}
    />
  );
}
