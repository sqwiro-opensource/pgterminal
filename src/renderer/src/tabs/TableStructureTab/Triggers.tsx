import { Trash2 } from 'lucide-react';
import type { RelationNode } from '@shared/types/catalog';
import { Badge, Cell, EmptyNote, Row, StructTable } from './parts';
import { dropTrigger, toggleTrigger } from './structureActions';
import type { StructureCtx } from './useStructureActions';

export function Triggers({ node, connectionId, database }: { node: RelationNode; connectionId: string; database: string }) {
  const list = node.triggers ?? [];
  const ctx: StructureCtx = { connectionId, database, node };
  if (list.length === 0) return <EmptyNote>No triggers</EmptyNote>;
  return (
    <StructTable headers={['Name', 'Timing', 'Events', 'Enabled', 'Definition', '']}>
      {list.map((t, i) => (
        <Row key={t.name} index={i}>
          <Cell className="font-medium">{t.name}</Cell>
          <Cell mono>{t.timing}</Cell>
          <Cell mono>{t.events.join(' OR ')}</Cell>
          <Cell>
            <button type="button" title={t.enabled ? 'Disable trigger' : 'Enable trigger'} onClick={() => toggleTrigger(ctx, t.name, !t.enabled)}>
              {t.enabled ? <Badge tone="ok">enabled</Badge> : <Badge>disabled</Badge>}
            </button>
          </Cell>
          <Cell mono muted title={t.definition} className="max-w-[640px]">{t.definition}</Cell>
          <Cell className="w-10">
            <button type="button" title="Drop trigger" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => dropTrigger(ctx, t.name)}><Trash2 size={12} strokeWidth={1.75} /></button>
          </Cell>
        </Row>
      ))}
    </StructTable>
  );
}
