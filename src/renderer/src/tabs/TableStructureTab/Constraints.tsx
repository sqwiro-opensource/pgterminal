import { Fragment } from 'react';
import { ArrowRight, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { ConstraintInfo, RelationNode } from '@shared/types/catalog';
import { CONSTRAINT_GROUP_LABELS, groupConstraints, type ConstraintGroups } from './structureModel';
import { Cell, EmptyNote, Row, StructTable, TargetChip } from './parts';
import { openStructure } from './workspaceBridge';
import { dropConstraint, openConstraintForm, validateConstraint } from './structureActions';

const ORDER: (keyof ConstraintGroups)[] = ['primary', 'foreign', 'unique', 'check', 'exclusion'];

function Target({ c, connectionId, database }: { c: ConstraintInfo; connectionId: string; database: string }) {
  if (c.type !== 'f' || !c.refSchema || !c.refTable) return <span className="text-muted-foreground">—</span>;
  const schema = c.refSchema;
  const table = c.refTable;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[12px]">{c.columns.join(', ')}</span>
      <ArrowRight size={12} strokeWidth={1.75} className="text-muted-foreground" />
      <TargetChip schema={schema} table={table} onClick={() => openStructure(connectionId, database, schema, table)} />
      <span className="font-mono text-[12px] text-muted-foreground">({(c.refColumns ?? []).join(', ')})</span>
    </span>
  );
}

export function Constraints({ node, connectionId, database }: { node: RelationNode; connectionId: string; database: string }) {
  const groups = groupConstraints(node.constraints);
  const total = ORDER.reduce((n, k) => n + groups[k].length, 0);
  const ctx = { connectionId, database, node };
  let index = 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-border px-2 text-[12px]">
        <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 hover:bg-accent" onClick={() => openConstraintForm(ctx)}>
          <Plus size={12} strokeWidth={1.75} /> Constraint
        </button>
      </div>
      {total === 0 ? <EmptyNote>No constraints</EmptyNote> : (
    <StructTable headers={['Name', 'Columns', 'Target', 'Actions', 'Definition', '']}>
      {ORDER.map((k) => {
        const list = groups[k];
        if (list.length === 0) return null;
        return (
          <Fragment key={k}>
            <tr>
              <td colSpan={6} className="h-6 border-b border-grid-line bg-muted/60 px-2 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                {CONSTRAINT_GROUP_LABELS[k]} ({list.length})
              </td>
            </tr>
            {list.map((c) => (
              <Row key={c.name} index={index++}>
                <Cell className="font-medium">{c.name}</Cell>
                <Cell mono>{c.columns.join(', ')}</Cell>
                <Cell className="max-w-[520px]">
                  <Target c={c} connectionId={connectionId} database={database} />
                </Cell>
                <Cell mono muted>
                  {c.type === 'f' ? `ON UPDATE ${c.onUpdate ?? 'no action'} · ON DELETE ${c.onDelete ?? 'no action'}` : ''}
                </Cell>
                <Cell mono muted title={c.definition} className="max-w-[560px]">
                  {c.definition}
                </Cell>
                <Cell className="w-16">
                  <span className="inline-flex gap-1">
                    {/NOT VALID/i.test(c.definition) && (
                      <button type="button" title="Validate constraint" className="rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => validateConstraint(ctx, c.name)}><ShieldCheck size={12} strokeWidth={1.75} /></button>
                    )}
                    <button type="button" title="Drop constraint" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => dropConstraint(ctx, c.name)}><Trash2 size={12} strokeWidth={1.75} /></button>
                  </span>
                </Cell>
              </Row>
            ))}
          </Fragment>
        );
      })}
    </StructTable>
      )}
    </div>
  );
}
