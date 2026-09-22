import { Braces, ChevronLeft, ChevronRight, EllipsisVertical, RefreshCw, Save, Table2, Trash2 } from 'lucide-react';
import { DOCUMENT_COLOR } from '@renderer/lib/objectIcons';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/dropdown-menu';
import type { DocTarget } from '@shared/types/doclink';
import { IconButton } from '@renderer/components/ui/IconButton';

export interface HeaderProps {
  serverName: string;
  database: string;
  target: DocTarget;
  canBack: boolean;
  canForward: boolean;
  view: 'tree' | 'json';
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  onBack(): void;
  onForward(): void;
  onView(v: 'tree' | 'json'): void;
  onOpenTable(): void;
  onOpenStructure(): void;
  onReload(): void;
  onCopyJson(): void;
  onCopyId(): void;
  onDelete(): void;
  onSave(): void;
}

export function Header(p: HeaderProps): JSX.Element {
  const crumb = 'truncate text-[12px] text-muted-foreground hover:text-foreground';
  return (
    <div className="flex h-9 flex-none items-center gap-1 border-b border-border px-2">
      <IconButton label="Back (⌘[)" onClick={p.onBack} disabled={!p.canBack}>
        <ChevronLeft size={14} strokeWidth={1.75} />
      </IconButton>
      <IconButton label="Forward (⌘])" onClick={p.onForward} disabled={!p.canForward}>
        <ChevronRight size={14} strokeWidth={1.75} />
      </IconButton>
      <span className="mx-1 inline-block h-2 w-2 rounded-full bg-success" />
      <nav className="flex min-w-0 items-center gap-1 font-mono">
        <span className={crumb}>{p.serverName}</span>
        <span className="text-muted-foreground/60">›</span>
        <span className={crumb}>{p.database}</span>
        <span className="text-muted-foreground/60">›</span>
        <button type="button" className={crumb} onClick={p.onOpenStructure} title="Open structure">
          {p.target.schema}.{p.target.table}
        </button>
        <span className="text-muted-foreground/60">›</span>
        <span className="truncate text-[12.5px] font-semibold text-foreground">{p.target.keyValue}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <div className="inline-flex h-7 overflow-hidden rounded border border-border">
          {(['tree', 'json'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={cn('px-2.5 text-[12px] capitalize', p.view === v ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60')}
              onClick={() => p.onView(v)}
            >
              {v === 'json' ? 'JSON' : 'Tree'}
            </button>
          ))}
        </div>
        <button type="button" className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2 text-[12px] hover:bg-accent" onClick={p.onOpenTable}>
          <Table2 size={13} strokeWidth={1.75} /> Open in table
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-accent" aria-label="More">
              <EllipsisVertical size={14} strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-[12.5px]">
            <DropdownMenuItem onSelect={p.onCopyJson}>Copy JSON</DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onCopyId}>Copy _id</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={p.onReload}>
              <RefreshCw size={13} strokeWidth={1.75} className="mr-2" /> Reload
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Duplicate row (soon)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded border border-destructive/40 px-2 text-[12px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
          onClick={p.onDelete}
          disabled={p.readOnly}
          title={p.readOnly ? 'Read-only connection' : 'Delete this row'}
        >
          <Trash2 size={13} strokeWidth={1.75} /> Delete
        </button>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          onClick={p.onSave}
          disabled={!p.dirty || p.saving || p.readOnly}
          title="Save (⌘S)"
        >
          <Save size={13} strokeWidth={1.75} /> Save <kbd className="kbd ml-1">⌘S</kbd>
        </button>
        <Braces size={14} strokeWidth={1.75} className={`ml-1 ${DOCUMENT_COLOR}`} />
      </div>
    </div>
  );
}
