import { ChevronDown, Ellipsis, LoaderCircle, Play, Search, SquareX, TextQuote, WandSparkles } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@cloudhub-ux/shadcn/esm/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/tooltip';
import type { ConnectionMeta, DatabaseInfo } from '@shared/types/connection';
import type { LimitChoice, QueryTabRuntime } from './runManager';

export interface ToolbarProps {
  rt: QueryTabRuntime;
  elapsedMs: number;
  connection: ConnectionMeta | undefined;
  connections: ConnectionMeta[];
  databases: DatabaseInfo[];
  database: string;
  editorReady: boolean;
  onRun(kind: 'all' | 'statement'): void;
  onExplain(analyze: boolean): void;
  onFormat(): void;
  onCancel(): void;
  onLimit(limit: LimitChoice): void;
  onTxMode(mode: 'auto' | 'manual'): void;
  onDatabase(db: string): void;
  onConnection(id: string): void;
  onHistory(): void;
}

const LIMITS: Array<{ v: LimitChoice; label: string }> = [
  { v: 100, label: '100' },
  { v: 500, label: '500' },
  { v: 1000, label: '1,000' },
  { v: 5000, label: '5,000' },
  { v: 'none', label: 'None' }
];

function TBtn({ label, shortcut, onClick, disabled, primary, children }: { label: string; shortcut?: string; onClick(): void; disabled?: boolean; primary?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-45',
            primary ? 'border-transparent bg-primary text-primary-foreground hover:brightness-110' : 'border-border bg-background hover:bg-accent'
          )}
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
}

const SELECT = 'h-7 rounded-[5px] border border-input bg-background px-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring';

export function Toolbar(p: ToolbarProps): JSX.Element {
  const running = p.rt.run.running;
  const connected = p.connections.filter((c) => c.id === p.connection?.id || true);
  return (
    <div className="flex h-9 flex-none items-center gap-1.5 border-b border-border px-2">
      <TBtn label="Run" shortcut="⌘↵" onClick={() => p.onRun('all')} disabled={running || !p.editorReady} primary>
        <Play size={13} strokeWidth={2} /> Run
      </TBtn>
      <TBtn label="Run selection or statement at cursor" shortcut="⌘⇧↵" onClick={() => p.onRun('statement')} disabled={running || !p.editorReady}>
        <TextQuote size={13} strokeWidth={1.75} /> Selection
      </TBtn>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={running || !p.editorReady} className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-border bg-background px-2 text-[12px] font-medium hover:bg-accent disabled:opacity-45">
            <Search size={13} strokeWidth={1.75} /> Explain <ChevronDown size={12} strokeWidth={1.75} className="text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-[12.5px]">
          <DropdownMenuItem onSelect={() => p.onExplain(false)}>Explain <span className="kbd ml-auto">⌘E</span></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => p.onExplain(true)}>Explain analyze <span className="kbd ml-auto">⌘⇧E</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TBtn label="Format SQL" shortcut="⌘⇧F" onClick={p.onFormat} disabled={!p.editorReady}>
        <WandSparkles size={13} strokeWidth={1.75} /> Format
      </TBtn>
      <TBtn label="Cancel running query" shortcut="⌘." onClick={p.onCancel} disabled={!running}>
        {running ? <LoaderCircle size={13} strokeWidth={2} className="animate-spin" /> : <SquareX size={13} strokeWidth={1.75} />} Cancel
      </TBtn>
      <span className="mx-1 h-[18px] w-px bg-border" />
      <label className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
        Limit
        <select className={SELECT} value={String(p.rt.limit)} onChange={(e) => p.onLimit((e.target.value === 'none' ? 'none' : Number(e.target.value)) as LimitChoice)}>
          {LIMITS.map((l) => (
            <option key={String(l.v)} value={String(l.v)}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <select className={SELECT} value={p.rt.txMode} onChange={(e) => p.onTxMode(e.target.value as 'auto' | 'manual')} title="Transaction mode">
        <option value="auto">Autocommit</option>
        <option value="manual">Manual transaction</option>
      </select>
      <span className="mx-1 h-[18px] w-px bg-border" />
      <span className={cn('inline-block h-2 w-2 rounded-full', p.connection ? 'bg-success' : 'border border-muted-foreground')} />
      <select className={cn(SELECT, 'max-w-[160px] font-mono')} value={p.connection?.id ?? ''} onChange={(e) => p.onConnection(e.target.value)} title="Connection">
        {connected.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {p.connection && <span className={cn('env-badge', p.connection.env)}>{p.connection.env}</span>}
      <select className={cn(SELECT, 'max-w-[160px] font-mono')} value={p.database} onChange={(e) => p.onDatabase(e.target.value)} title="Database">
        {(p.databases.length ? p.databases : [{ name: p.database }]).map((d) => (
          <option key={d.name} value={d.name}>
            {d.name}
          </option>
        ))}
      </select>
      {p.connection?.readOnly && <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">read-only</span>}
      <span className="flex-1" />
      {running && <span className="font-mono text-[11.5px] text-muted-foreground">{(p.elapsedMs / 1000).toFixed(1)} s · statement {Math.min(p.rt.run.currentStatement + 1, Math.max(1, p.rt.run.statementCount))} of {p.rt.run.statementCount || '?'}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More" className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            <Ellipsis size={14} strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-[12.5px]">
          <DropdownMenuItem disabled title="Phase 7">Save query…</DropdownMenuItem>
          <DropdownMenuItem onSelect={p.onHistory}>History <span className="kbd ml-auto">⌘⇧H</span></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled title="Phase 5">Export result as CSV…</DropdownMenuItem>
          <DropdownMenuItem disabled title="Phase 5">Export result as JSON…</DropdownMenuItem>
          <DropdownMenuItem disabled title="Phase 5">Export result as SQL…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
