import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { RelationNode } from '@shared/types/catalog';
import { formatBytes } from '@renderer/features/tree/treeModel';
import { Badge, Cell, EmptyNote, Row, StructTable } from './parts';
import { dropIndex, openIndexForm, reindex } from './structureActions';
import type { StructureCtx } from './useStructureActions';

export function Indexes({ node, connectionId, database }: { node: RelationNode; connectionId: string; database: string }) {
  const list = node.indexes ?? [];
  const ctx: StructureCtx = { connectionId, database, node };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-border px-2 text-[12px]">
        <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 hover:bg-accent" onClick={() => openIndexForm(ctx)}>
          <Plus size={12} strokeWidth={1.75} /> Index
        </button>
      </div>
      {list.length === 0 ? (
        <EmptyNote>No indexes</EmptyNote>
      ) : (
        <StructTable headers={['Name', 'Columns', 'Definition', 'Flags', 'Size', '']}>
          {list.map((ix, i) => (
            <Row key={ix.name} index={i}>
              <Cell className="font-medium">{ix.name}</Cell>
              <Cell mono>{ix.columns.join(', ')}</Cell>
              <Cell mono muted title={ix.definition} className="max-w-[560px]">{ix.definition}</Cell>
              <Cell>
                <span className="inline-flex gap-1">
                  {ix.isPrimary && <Badge tone="warn">PRIMARY</Badge>}
                  {ix.isUnique && !ix.isPrimary && <Badge tone="info">UNIQUE</Badge>}
                  <Badge>{ix.method}</Badge>
                </span>
              </Cell>
              <Cell mono muted className="text-right">{formatBytes(ix.sizeBytes)}</Cell>
              <Cell className="w-16">
                <span className="inline-flex gap-1">
                  <button type="button" title="Reindex" className="rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={() => reindex(ctx, ix.name)}><RefreshCw size={12} strokeWidth={1.75} /></button>
                  <button type="button" title={ix.isPrimary ? 'Drop the primary key constraint instead' : 'Drop index'} disabled={ix.isPrimary} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40" onClick={() => dropIndex(ctx, ix.name)}><Trash2 size={12} strokeWidth={1.75} /></button>
                </span>
              </Cell>
            </Row>
          ))}
        </StructTable>
      )}
    </div>
  );
}
