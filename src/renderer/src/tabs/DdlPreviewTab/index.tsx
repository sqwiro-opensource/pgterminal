import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Copy, FileCode2, RefreshCw, SquarePen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import type { PgErrorInfo } from '@shared/types/query';
import type { Tab } from '@shared/types/workspace';
import { pgui } from '@renderer/lib/ipc';
import { openQueryTab } from '@renderer/features/tree/actions';

type State = { status: 'loading' } | { status: 'ready'; sql: string } | { status: 'error'; error: PgErrorInfo };

function toError(err: unknown): PgErrorInfo {
  if (err && typeof err === 'object' && 'message' in err) return { message: String((err as { message: unknown }).message) };
  return { message: String(err) };
}

/** Read-only DDL for one object. Monaco replaces the <pre> in P3.3. */
export default function DdlPreviewTab({ tab }: { tab: Tab<'ddl-preview'> }): JSX.Element {
  const { ddl, connectionId, database } = tab.params;
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { sql } = await pgui['ddl:get'](ddl);
      setState({ status: 'ready', sql });
    } catch (err) {
      setState({ status: 'error', error: toError(err) });
    }
  }, [ddl]);

  useEffect(() => {
    void load();
  }, [load]);

  const qualified = ddl.schema ? `${ddl.schema}.${ddl.name}` : ddl.name;
  const sql = state.status === 'ready' ? state.sql : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[12.5px]">
        <FileCode2 size={14} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="font-mono">{qualified}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{ddl.kind}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" disabled={!sql} onClick={() => void navigator.clipboard.writeText(sql).then(() => toast.success('DDL copied'))}>
          <Copy size={13} strokeWidth={1.75} /> Copy
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => void load()}>
          <RefreshCw size={13} strokeWidth={1.75} /> Refresh
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[12px]" disabled={!sql} onClick={() => openQueryTab({ connectionId, database, sql, name: `DDL · ${ddl.name}` })}>
          <SquarePen size={13} strokeWidth={1.75} /> Open in query tab
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {state.status === 'loading' && <Skeleton />}
        {state.status === 'error' && <ErrorCard error={state.error} onRetry={() => void load()} />}
        {state.status === 'ready' && <CodeView sql={state.sql} />}
      </div>
    </div>
  );
}

function CodeView({ sql }: { sql: string }): JSX.Element {
  const lines = sql.split('\n');
  return (
    <pre className="m-0 grid grid-cols-[auto_1fr] font-mono text-[12.5px] leading-[1.6]">
      {lines.map((line, i) => (
        <span key={i} className="contents">
          <span className="select-none pr-3 text-right text-muted-foreground/60" style={{ paddingLeft: 12 }}>{i + 1}</span>
          <span className="whitespace-pre pr-4">{line || ' '}</span>
        </span>
      ))}
    </pre>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div className="space-y-2 p-4">
      {[80, 60, 70, 40, 65, 30].map((w, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function ErrorCard({ error, onRetry }: { error: PgErrorInfo; onRetry(): void }): JSX.Element {
  return (
    <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[12.5px]">
      <div className="flex items-center gap-2 font-medium text-destructive">
        <CircleAlert size={14} strokeWidth={1.75} /> Could not load DDL
      </div>
      <p className="mt-1">{error.message}</p>
      {error.hint && <p className="mt-1 text-muted-foreground">{error.hint}</p>}
      <Button variant="outline" size="sm" className="mt-2 h-7 text-[12px]" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
