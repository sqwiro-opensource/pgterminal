import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, RefreshCw, ScanSearch, X } from 'lucide-react';
import type { BacklinkGroupRef, BacklinkScopeMode, BacklinksEvent, DocTarget } from '@shared/types/doclink';
import type { CellValue, PgErrorInfo } from '@shared/types/query';
import type { Filter } from '@shared/types/rows';
import { pgui, useIpcEvent } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { DocLinkChip } from '@renderer/features/doclink/DocLinkChip';
import { EmptyState } from '@renderer/components/EmptyState';

type GroupResult = { count: number; truncated: boolean; error?: PgErrorInfo };

const SCOPES: Array<{ v: BacklinkScopeMode; label: string }> = [
  { v: 'fkOnly', label: 'FK only' },
  { v: 'sameSchema', label: 'FK + same schema' },
  { v: 'wholeDb', label: 'Whole database' }
];

function groupKey(g: BacklinkGroupRef): string {
  return `${g.via}:${g.schema}.${g.table}.${g.column}:${g.constraint ?? ''}`;
}

function refForms(target: DocTarget): string[] {
  const k = target.keyValue;
  const plain = `${target.table}/${k.includes('/') ? k.slice(k.indexOf('/') + 1) : k}`;
  const prefixed = `${target.schema}_${target.table}/${plain.slice(plain.indexOf('/') + 1)}`;
  return Array.from(new Set([k, plain, prefixed]));
}

function sqlLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Filter that reproduces one backlink group in a table-data tab. */
export function backlinkFilter(g: BacklinkGroupRef, target: DocTarget, row: Record<string, CellValue>): Filter[] {
  const forms = refForms(target);
  const col = /^[a-z_][a-z0-9_]*$/.test(g.column) ? g.column : `"${g.column.replace(/"/g, '""')}"`;
  switch (g.via) {
    case 'fk':
      return [{ column: g.column, op: 'eq', value: (row[target.keyColumn === '_id' ? 'id' : target.keyColumn] ?? row[target.keyColumn] ?? target.keyValue) as string }];
    case 'text':
      return [{ column: g.column, op: 'in', value: forms }];
    case 'array':
      return [{ column: g.column, op: 'raw', value: `${col} && ARRAY[${forms.map(sqlLit).join(', ')}]::text[]` }];
    default:
      return [{ column: g.column, op: 'raw', value: forms.map((f) => `jsonb_path_exists(${col}::jsonb, ${sqlLit(`$.** ? (@ == "${f.replace(/"/g, '')}")`)})`).join(' OR ') }];
  }
}

export interface BacklinksPanelProps {
  connectionId: string;
  database: string;
  target: DocTarget;
  row: Record<string, CellValue>;
}

/** "Referenced by": streams FK groups first, then jsonb/text/array scans in the chosen scope. */
export function BacklinksPanel({ connectionId, database, target, row }: BacklinksPanelProps): JSX.Element {
  const defaultScope = useStore((s) => s.settings.backlinkScopeDefault);
  const openTab = useStore((s) => s.openTab);
  const [scope, setScope] = useState<BacklinkScopeMode>(defaultScope === 'tables' ? 'sameSchema' : defaultScope);
  const [plan, setPlan] = useState<BacklinkGroupRef[]>([]);
  const [results, setResults] = useState<Record<string, GroupResult>>({});
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'cancelled'>('idle');
  const jobRef = useRef<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);

  const run = useCallback(
    async (mode: BacklinkScopeMode): Promise<void> => {
      const jobId = crypto.randomUUID();
      jobRef.current = jobId;
      setPlan([]);
      setResults({});
      setStatus('running');
      try {
        await pgui['doclink:backlinks']({ jobId, connectionId, database, target, row, scope: { mode }, perTableLimit: 50, perQueryTimeoutMs: 5000 });
      } catch (e) {
        setStatus('done');
        setResults({ error: { count: 0, truncated: false, error: { message: e instanceof Error ? e.message : String(e) } } });
      }
    },
    [connectionId, database, target, row]
  );

  useIpcEvent('doclink:backlinksEvent', (e: BacklinksEvent) => {
    if (e.jobId !== jobRef.current) return;
    if (e.type === 'plan') setPlan(e.groups);
    else if (e.type === 'group') {
      const { count, truncated, error } = e;
      setResults((r) => ({ ...r, [groupKey(e)]: { count, truncated, ...(error ? { error } : {}) } }));
    } else {
      setStatus(e.type === 'done' ? 'done' : 'cancelled');
      setScannedAt(Date.now());
    }
  });

  useEffect(() => {
    void run(scope);
    return () => {
      const id = jobRef.current;
      if (id) void pgui['doclink:cancelBacklinks']({ jobId: id }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.schema, target.table, target.keyValue, scope]);

  const groups = useMemo(() => {
    const fk = plan.filter((g) => g.via === 'fk');
    const rest = plan.filter((g) => g.via !== 'fk');
    const order = (a: BacklinkGroupRef, b: BacklinkGroupRef): number => (results[groupKey(b)]?.count ?? -1) - (results[groupKey(a)]?.count ?? -1);
    return { fk: fk.sort(order), rest: rest.sort(order) };
  }, [plan, results]);
  const done = Object.keys(results).length;
  const nonEmpty = (g: BacklinkGroupRef): boolean => (results[groupKey(g)]?.count ?? 1) > 0 || !!results[groupKey(g)]?.error;

  const openGroup = (g: BacklinkGroupRef): void => {
    openTab('table-data', { connectionId, database, schema: g.schema, table: g.table, filters: backlinkFilter(g, target, row), sort: [], page: { mode: 'keyset', after: null } });
  };

  const Group = ({ g }: { g: BacklinkGroupRef }): JSX.Element => {
    const r = results[groupKey(g)];
    return (
      <button type="button" className="flex h-7 w-full items-center gap-2 rounded px-1 text-left text-[12px] hover:bg-accent" onClick={() => openGroup(g)}>
        <DocLinkChip raw={`${g.schema}.${g.table}/…`} connectionId={connectionId} database={database} className="pointer-events-none" />
        <span className="truncate text-muted-foreground">
          via {g.via === 'fk' ? g.column : `${g.column} ${g.via === 'jsonb' ? '@>' : g.via === 'array' ? '&&' : '='} …`}
        </span>
        <span className="ml-auto font-mono text-[11.5px]">
          {!r && <LoaderCircle size={12} className="animate-spin text-muted-foreground" />}
          {r?.error && <span title={r.error.message} className="text-warning">?</span>}
          {r && !r.error && (r.count > 999 ? '999+' : r.truncated ? `${r.count}+` : r.count)}
        </span>
        <ChevronRight size={12} strokeWidth={1.75} className="text-muted-foreground" />
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-8 items-center gap-2 border-b border-border px-2 text-[12px] font-semibold">
        Referenced by
        <span className="font-normal text-muted-foreground">{done}/{plan.length}</span>
        <select className="ml-auto h-6 rounded border border-input bg-background px-1 text-[11.5px] font-normal" value={scope} onChange={(e) => setScope(e.target.value as BacklinkScopeMode)}>
          {SCOPES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
        {status === 'running' ? (
          <button type="button" title="Cancel" className="rounded p-1 hover:bg-accent" onClick={() => jobRef.current && void pgui['doclink:cancelBacklinks']({ jobId: jobRef.current })}>
            <X size={12} strokeWidth={1.75} />
          </button>
        ) : (
          <button type="button" title="Rescan" className="rounded p-1 hover:bg-accent" onClick={() => void run(scope)}>
            <RefreshCw size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {groups.fk.length > 0 && <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Foreign keys</div>}
        {groups.fk.filter(nonEmpty).map((g) => (
          <Group key={groupKey(g)} g={g} />
        ))}
        {groups.rest.length > 0 && <div className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">jsonb / text / arrays</div>}
        {groups.rest.filter(nonEmpty).map((g) => (
          <Group key={groupKey(g)} g={g} />
        ))}
        {status === 'done' && plan.filter(nonEmpty).length === 0 && (
          <EmptyState
            dense
            title="No references in scope"
            description={scope === 'wholeDb' ? 'Nothing in this database points at this row.' : undefined}
            action={scope === 'wholeDb' ? undefined : { label: 'Widen scope', onClick: () => setScope('wholeDb') }}
          />
        )}
        {status === 'running' && plan.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-2 text-[11.5px] text-muted-foreground">
            <LoaderCircle size={12} className="animate-spin" /> Scanning {done}/{plan.length}
          </div>
        )}
        {scope !== 'wholeDb' && status !== 'running' && (
          <button type="button" className="mt-2 inline-flex h-7 items-center gap-1.5 rounded border border-border px-2 text-[12px] hover:bg-accent" onClick={() => setScope('wholeDb')}>
            <ScanSearch size={13} strokeWidth={1.75} /> Scan jsonb in whole db…
          </button>
        )}
        {scannedAt && status !== 'running' && <div className="px-1 pt-2 text-[10.5px] text-muted-foreground">last scan {new Date(scannedAt).toLocaleTimeString()}</div>}
      </div>
    </div>
  );
}
