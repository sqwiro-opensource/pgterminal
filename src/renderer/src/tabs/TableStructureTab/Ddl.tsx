import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, SquareCode } from 'lucide-react';
import { Skeleton } from '@renderer/components/ui/Skeleton';
import { pgui } from '@renderer/lib/ipc';
import type { RelationNode } from '@shared/types/catalog';
import { ddlKindFor } from './structureModel';
import { ErrorBox } from './parts';

export interface DdlState {
  sql: string | null;
  loading: boolean;
  error: string | null;
  reload(): void;
}

/** Fetches the relation DDL through ddl:get; shared by the DDL and Partitions sub-tabs. */
export function useDdl(node: RelationNode | null, connectionId: string, database: string, enabled: boolean): DdlState {
  const [sql, setSql] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!node || !enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    pgui['ddl:get']({ connectionId, database, kind: ddlKindFor(node.kind), schema: node.schema, name: node.name })
      .then((r) => {
        if (!cancelled) setSql(r.sql);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [node, connectionId, database, enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { sql, loading, error, reload };
}

function ToolbarButton({ label, onClick, disabled, title, children }: { label: string; onClick?(): void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="inline-flex h-6 items-center gap-1.5 rounded border border-border bg-background px-2 text-[12px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
      {label}
    </button>
  );
}

export function Ddl({ state }: { state: DdlState }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!state.sql) return;
    await navigator.clipboard.writeText(state.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-8 items-center gap-1.5 border-b border-border px-2">
        <ToolbarButton label={copied ? 'Copied' : 'Copy'} onClick={() => void copy()} disabled={!state.sql}>
          {copied ? <Check size={13} strokeWidth={1.75} /> : <Copy size={13} strokeWidth={1.75} />}
        </ToolbarButton>
        <ToolbarButton label="Open in query tab" disabled title="Query tabs arrive with Phase 3">
          <SquareCode size={13} strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton label="Refresh" onClick={state.reload} disabled={state.loading}>
          <RefreshCw size={13} strokeWidth={1.75} className={state.loading ? 'animate-spin' : undefined} />
        </ToolbarButton>
      </div>
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.loading && !state.sql ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
          ))}
        </div>
      ) : (
        state.sql && <pre className="flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed">{state.sql}</pre>
      )}
    </div>
  );
}
