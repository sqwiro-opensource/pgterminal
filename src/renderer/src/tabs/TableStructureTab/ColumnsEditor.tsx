/** Editable Columns grid: cell edits become pending ALTERs (amber), plus add/drop column rows. */
import { useState } from 'react';
import { KeyRound, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { ColumnInfo } from '@shared/types/catalog';
import { COMMON_TYPES, ColumnGrid } from '@renderer/features/structure/ColumnGrid';
import { Badge, Cell, Row, StructTable } from './parts';
import { columnBadges } from './structureModel';
import * as PA from './pendingAlters';
import { confirmAndRun, type StructureCtx } from './useStructureActions';

const INPUT = 'h-6 w-full min-w-[80px] rounded border border-transparent bg-transparent px-1 font-mono text-[12px] outline-none hover:border-input focus:border-input focus:ring-2 focus:ring-ring';

export function ColumnsEditor({ ctx }: { ctx: StructureCtx }) {
  const cols = ctx.node.columns ?? [];
  const [pending, setPending] = useState<PA.PendingAlters>(PA.NO_ALTERS);
  const count = PA.alterCount(pending);
  const edit = (c: ColumnInfo, patch: PA.ColumnEdit) => setPending((p) => PA.editColumn(p, c, patch));
  const val = <K extends keyof PA.ColumnEdit>(c: ColumnInfo, k: K, fallback: PA.ColumnEdit[K]): PA.ColumnEdit[K] => (pending.edits[c.name]?.[k] ?? fallback) as PA.ColumnEdit[K];
  const apply = () =>
    confirmAndRun(ctx, {
      title: `Alter ${ctx.node.schema}.${ctx.node.name}`,
      verb: `Apply ${count} change${count === 1 ? '' : 's'}`,
      variant: pending.dropped.length ? 'destructive' : 'neutral',
      summary: `${count} statement${count === 1 ? '' : 's'} run in order. ALTER TABLE takes an exclusive lock for the duration.`,
      statements: PA.buildAlterStatements(ctx.node.schema, ctx.node.name, cols, pending),
      typedName: pending.dropped.length ? ctx.node.name : undefined
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-border px-2 text-[12px]">
        <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 hover:bg-accent" onClick={() => setPending((p) => PA.addColumn(p, { name: '', dataType: 'text', nullable: true, default: '' }))}>
          <Plus size={12} strokeWidth={1.75} /> Column
        </button>
        <span className="text-muted-foreground">Edit type, nullable, default or comment in place; changes stay pending until applied.</span>
        <span className="flex-1" />
        {count > 0 && (
          <>
            <button type="button" className="h-6 rounded border border-border px-2 hover:bg-accent" onClick={() => setPending(PA.NO_ALTERS)}>
              Discard
            </button>
            <button type="button" className="h-6 rounded bg-primary px-2 font-medium text-primary-foreground" onClick={apply}>
              Apply {count}
            </button>
          </>
        )}
      </div>
      <StructTable headers={['#', 'Name', 'Type', 'Nullable', 'Default', 'Attributes', 'Comment', '']}>
        {cols.map((c, i) => {
          const dropped = pending.dropped.includes(c.name);
          const edited = Boolean(pending.edits[c.name]);
          const rowCls = dropped ? 'line-through opacity-60' : edited ? 'bg-pending/10 shadow-[inset_3px_0_0_hsl(var(--pending))]' : undefined;
          const locked = Boolean(c.generated);
          return (
            <Row key={c.name} index={i}>
              <Cell mono muted className={cn('w-10 text-right', rowCls)}>{c.ordinal}</Cell>
              <Cell className={rowCls}>
                <span className="inline-flex items-center gap-1.5">
                  {c.isPk ? <KeyRound size={12} strokeWidth={1.75} className="text-warning" /> : c.isFk ? <Link2 size={12} strokeWidth={1.75} className="text-link" /> : <span className="inline-block w-3" />}
                  <input value={val(c, 'name', c.name)} disabled={dropped} onChange={(e) => edit(c, { name: e.target.value })} className={cn(INPUT, 'font-medium')} />
                </span>
              </Cell>
              <Cell className={rowCls}><input list="ct-types" value={val(c, 'dataType', c.dataType)} disabled={dropped || locked} onChange={(e) => edit(c, { dataType: e.target.value })} className={INPUT} /></Cell>
              <Cell className={cn('text-center', rowCls)}><input type="checkbox" checked={val(c, 'nullable', c.nullable)} disabled={dropped || c.isPk} onChange={(e) => edit(c, { nullable: e.target.checked })} className="accent-[hsl(var(--primary))]" aria-label="Nullable" /></Cell>
              <Cell className={rowCls}><input value={val(c, 'default', c.default ?? '')} disabled={dropped || locked} placeholder="—" onChange={(e) => edit(c, { default: e.target.value })} className={INPUT} /></Cell>
              <Cell className={rowCls}>
                <span className="inline-flex flex-wrap gap-1">
                  {columnBadges(c).filter((b) => b !== 'pk' && b !== 'fk').map((b) => <Badge key={b} tone={b === 'unique' ? 'muted' : 'ok'}>{b.replace('-', ' ').toUpperCase()}</Badge>)}
                </span>
              </Cell>
              <Cell className={rowCls}><input value={val(c, 'comment', c.comment ?? '')} disabled={dropped} placeholder="—" onChange={(e) => edit(c, { comment: e.target.value })} className={INPUT} /></Cell>
              <Cell className="w-10 text-center">
                {dropped ? (
                  <button type="button" aria-label="Keep column" className="rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => setPending((p) => PA.undropColumn(p, c.name))}><RotateCcw size={12} strokeWidth={1.75} /></button>
                ) : (
                  <button type="button" aria-label="Drop column" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => setPending((p) => PA.dropColumn(p, c.name))}><Trash2 size={12} strokeWidth={1.75} /></button>
                )}
              </Cell>
            </Row>
          );
        })}
        <datalist id="ct-types">{COMMON_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      </StructTable>
      {pending.added.length > 0 && (
        <div className="flex-none border-t border-pending/50 bg-pending/10 p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New columns</div>
          <ColumnGrid columns={pending.added} onChange={(next) => setPending((p) => ({ ...p, added: next }))} />
        </div>
      )}
    </div>
  );
}
