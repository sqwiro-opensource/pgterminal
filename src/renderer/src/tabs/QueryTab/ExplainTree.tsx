import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { JsonValue } from '@shared/types/query';

interface PlanNode {
  type: string;
  relation?: string;
  alias?: string;
  totalCost: number;
  startupCost: number;
  planRows: number;
  actualTime?: number;
  actualRows?: number;
  extra: Array<[string, string]>;
  children: PlanNode[];
}

const SKIP = new Set(['Node Type', 'Plans', 'Relation Name', 'Alias', 'Total Cost', 'Startup Cost', 'Plan Rows', 'Actual Total Time', 'Actual Rows', 'Actual Startup Time', 'Actual Loops', 'Plan Width', 'Parent Relationship', 'Parallel Aware', 'Async Capable']);

function toNode(v: JsonValue): PlanNode | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, JsonValue>;
  const num = (k: string): number => (typeof o[k] === 'number' ? (o[k] as number) : 0);
  const plans = Array.isArray(o['Plans']) ? (o['Plans'] as JsonValue[]) : [];
  return {
    type: String(o['Node Type'] ?? 'Plan'),
    ...(typeof o['Relation Name'] === 'string' ? { relation: o['Relation Name'] as string } : {}),
    ...(typeof o['Alias'] === 'string' ? { alias: o['Alias'] as string } : {}),
    totalCost: num('Total Cost'),
    startupCost: num('Startup Cost'),
    planRows: num('Plan Rows'),
    ...(typeof o['Actual Total Time'] === 'number' ? { actualTime: o['Actual Total Time'] as number } : {}),
    ...(typeof o['Actual Rows'] === 'number' ? { actualRows: o['Actual Rows'] as number } : {}),
    extra: Object.entries(o)
      .filter(([k, val]) => !SKIP.has(k) && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean'))
      .map(([k, val]) => [k, String(val)] as [string, string]),
    children: plans.map(toNode).filter((n): n is PlanNode => n !== null)
  };
}

/** Parses the value of an `EXPLAIN (FORMAT JSON)` result cell into a plan tree. */
export function parsePlan(cell: JsonValue | undefined): { root: PlanNode; planningTime?: number; executionTime?: number } | null {
  let v = cell;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as JsonValue;
    } catch {
      return null;
    }
  }
  const first = Array.isArray(v) ? v[0] : v;
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null;
  const top = first as Record<string, JsonValue>;
  const root = toNode(top['Plan'] ?? null);
  if (!root) return null;
  return {
    root,
    ...(typeof top['Planning Time'] === 'number' ? { planningTime: top['Planning Time'] as number } : {}),
    ...(typeof top['Execution Time'] === 'number' ? { executionTime: top['Execution Time'] as number } : {})
  };
}

function Node({ node, depth, maxCost }: { node: PlanNode; depth: number; maxCost: number }): JSX.Element {
  const [open, setOpen] = useState(true);
  const pct = maxCost > 0 ? Math.max(2, Math.round((node.totalCost / maxCost) * 100)) : 0;
  return (
    <div>
      <div className="flex h-7 items-center gap-2 border-b border-grid-line text-[12.5px] hover:bg-accent/50" style={{ paddingLeft: 8 + depth * 18 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground" aria-label={open ? 'Collapse' : 'Expand'}>
          {node.children.length > 0 ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="inline-block w-3" />}
        </button>
        <span className="font-medium">{node.type}</span>
        {node.relation && (
          <span className="font-mono text-[12px] text-muted-foreground">
            {node.relation}
            {node.alias && node.alias !== node.relation ? ` ${node.alias}` : ''}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 pr-3 font-mono text-[11px] text-muted-foreground">
          <span className="inline-flex w-24 items-center gap-1">
            <span className="h-1.5 flex-1 rounded bg-muted">
              <span className="block h-full rounded bg-primary/60" style={{ width: `${pct}%` }} />
            </span>
          </span>
          <span title="startup..total cost">cost {node.startupCost.toFixed(2)}..{node.totalCost.toFixed(2)}</span>
          <span title="estimated rows">rows {node.planRows}</span>
          {node.actualTime !== undefined && <span className="text-time">{node.actualTime.toFixed(3)} ms</span>}
          {node.actualRows !== undefined && <span className="text-num">actual {node.actualRows}</span>}
        </span>
      </div>
      {open && node.extra.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-grid-line py-1 font-mono text-[11px] text-muted-foreground" style={{ paddingLeft: 30 + depth * 18 }}>
          {node.extra.map(([k, v]) => (
            <span key={k}>
              <span className="text-foreground/70">{k}:</span> {v}
            </span>
          ))}
        </div>
      )}
      {open && node.children.map((c, i) => <Node key={i} node={c} depth={depth + 1} maxCost={maxCost} />)}
    </div>
  );
}

export function ExplainTree({ cell }: { cell: JsonValue | undefined }): JSX.Element {
  const plan = parsePlan(cell);
  if (!plan) {
    return <pre className="overflow-auto p-3 font-mono text-[12px]">{typeof cell === 'string' ? cell : JSON.stringify(cell, null, 2)}</pre>;
  }
  return (
    <div className="h-full overflow-auto">
      <div className="flex h-7 items-center gap-4 border-b border-border bg-grid-header px-3 font-mono text-[11px] text-muted-foreground">
        {plan.planningTime !== undefined && <span>planning {plan.planningTime.toFixed(3)} ms</span>}
        {plan.executionTime !== undefined && <span>execution {plan.executionTime.toFixed(3)} ms</span>}
        <span>total cost {plan.root.totalCost.toFixed(2)}</span>
      </div>
      <Node node={plan.root} depth={0} maxCost={plan.root.totalCost} />
    </div>
  );
}
