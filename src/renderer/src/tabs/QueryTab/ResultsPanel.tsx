import { useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Braces, Hash, LoaderCircle, RefreshCw } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { PgErrorInfo } from '@shared/types/query';
import { ResultsGrid, RowDetail, type Density } from '@renderer/features/grid';
import type { GridLinkContextValue } from '@renderer/features/grid/cells/linkContext';
import { ExplainTree } from './ExplainTree';
import { MessagesPanel } from './MessagesPanel';
import type { ResultSet } from './queryRuntime';
import type { QueryTabRuntime, ResultView } from './runManager';

export interface ResultsPanelProps {
  rt: QueryTabRuntime;
  density: Density;
  onView(view: ResultView): void;
  onLoadMore(statementIndex: number): void;
  onExactCount(statementIndex: number): void;
  onToggleDetail(): void;
  onShowInEditor(error: PgErrorInfo): void;
  /** Connection/database context so link-shaped values render as document chips. */
  linkCtx?: GridLinkContextValue;
}

function resultLabel(r: ResultSet, i: number): string {
  if (r.error) return `Result ${i + 1} · error`;
  if (r.fields.length > 0) return `Result ${i + 1} · ${r.rows.length.toLocaleString()}${r.truncated ? '+' : ''} rows`;
  if (r.command) return `Result ${i + 1} · ${r.command}${r.rowCount !== null ? ` ${r.rowCount}` : ''}`;
  return `Result ${i + 1}`;
}

function Footer({ r, exact, running, onLoadMore, onExactCount }: { r: ResultSet; exact?: string; running: boolean; onLoadMore(): void; onExactCount(): void }): JSX.Element {
  const [counting, setCounting] = useState(false);
  const n = r.rows.length;
  return (
    <div className="flex h-7 flex-none items-center gap-3 border-t border-border px-2.5 text-[11.5px] text-muted-foreground">
      <span>
        Showing {n === 0 ? 0 : 1}–{n.toLocaleString()} of {exact ?? (r.truncated ? '?' : n.toLocaleString())}
      </span>
      {r.truncated && (
        <>
          <span className="text-warning">truncated at cap</span>
          <button type="button" onClick={onLoadMore} disabled={running} className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-px hover:bg-accent disabled:opacity-45" title="Re-executes the statement with a higher cap">
            <RefreshCw size={11} strokeWidth={1.75} /> Load more
          </button>
        </>
      )}
      {r.fields.length > 0 && !exact && (
        <button
          type="button"
          disabled={counting || running}
          onClick={() => {
            setCounting(true);
            Promise.resolve(onExactCount()).finally(() => setCounting(false));
          }}
          className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-px hover:bg-accent disabled:opacity-45"
          title="SELECT count(*) over this statement"
        >
          {counting ? <LoaderCircle size={11} className="animate-spin" /> : <Hash size={11} strokeWidth={1.75} />} Exact count
        </button>
      )}
      <span className="flex-1" />
      {r.command && <span className="font-mono">{r.command}</span>}
      {r.durationMs !== null && <span className="font-mono">{r.durationMs} ms</span>}
    </div>
  );
}

export function ResultsPanel(p: ResultsPanelProps): JSX.Element {
  const { run } = p.rt;
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const view = p.rt.view;
  const active: ResultSet | undefined = typeof view === 'number' ? run.results[view] : undefined;
  const errorCount = run.messages.filter((m) => m.kind === 'error').length;
  const explainCell = useMemo(() => (run.explain ? run.results.find((r) => r.rows.length > 0)?.rows[0]?.[0] : undefined), [run.explain, run.results]);

  const tabBtn = (label: string, v: ResultView, extra?: React.ReactNode): JSX.Element => (
    <button
      key={String(v)}
      type="button"
      onClick={() => p.onView(v)}
      className={cn(
        'flex h-7 flex-none items-center gap-1.5 border-b-2 px-2.5 text-[12px]',
        view === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
      {extra}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 flex-none items-stretch overflow-x-auto border-b border-border bg-grid-header [scrollbar-width:none]">
        {run.results.map((r, i) => tabBtn(resultLabel(r, i), i, r.error ? <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> : undefined))}
        {tabBtn(`Messages${run.messages.length ? ` (${run.messages.length})` : ''}`, 'messages', errorCount > 0 ? <span className="rounded-full bg-destructive/15 px-1.5 text-[10px] text-destructive">{errorCount}</span> : undefined)}
        {run.explain && tabBtn('Explain', 'explain')}
        <span className="flex-1" />
        {run.running && (
          <span className="flex items-center gap-1.5 px-2 text-[11.5px] text-muted-foreground">
            <LoaderCircle size={12} className="animate-spin" /> running
          </span>
        )}
        {active && active.fields.length > 0 && (
          <button type="button" onClick={p.onToggleDetail} className={cn('flex items-center gap-1 px-2 text-[11.5px] hover:text-foreground', p.rt.showDetail ? 'text-foreground' : 'text-muted-foreground')} title="Row detail">
            <Braces size={12} strokeWidth={1.75} /> Detail
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {view === 'messages' ? (
          <MessagesPanel messages={run.messages} onShowInEditor={p.onShowInEditor} />
        ) : view === 'explain' ? (
          <ExplainTree cell={explainCell} />
        ) : !active ? (
          <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">{run.running ? 'Running…' : 'Run a query to see results (⌘↵).'}</div>
        ) : active.fields.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[12.5px] text-muted-foreground">
            {active.error ? (
              <span className="text-destructive">{active.error.message}</span>
            ) : (
              <span className="font-mono">
                {active.command ?? 'OK'} {active.rowCount !== null ? active.rowCount : ''}
              </span>
            )}
            {active.durationMs !== null && <span className="font-mono text-[11px]">{active.durationMs} ms</span>}
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="h-full">
            <Panel minSize={30} className="flex min-h-0 flex-col">
              <ResultsGrid
                fields={active.fields}
                rows={active.rows}
                density={p.density}
                loading={run.running && active.rows.length === 0 && !active.done}
                error={active.error ?? null}
                emptyText={active.command ? `No rows · ${active.command}` : 'No rows'}
                linkCtx={p.linkCtx}
                onFocusRow={setFocusRow}
                sizingKey={`query:${active.fields.map((f) => f.name).join(',')}`}
                className="min-h-0 flex-1"
              />
              <Footer r={active} exact={p.rt.exactCounts[active.statementIndex]} running={run.running} onLoadMore={() => p.onLoadMore(active.statementIndex)} onExactCount={() => p.onExactCount(active.statementIndex)} />
            </Panel>
            {p.rt.showDetail && (
              <>
                <PanelResizeHandle className="w-px bg-border data-[resize-handle-active]:bg-primary" />
                <Panel defaultSize={30} minSize={15} className="min-h-0">
                  <RowDetail fields={active.fields} row={focusRow !== null ? active.rows[focusRow] ?? null : null} title={focusRow !== null ? `Row ${focusRow + 1}` : 'Row'} onClose={p.onToggleDetail} />
                </Panel>
              </>
            )}
          </PanelGroup>
        )}
      </div>
    </div>
  );
}
