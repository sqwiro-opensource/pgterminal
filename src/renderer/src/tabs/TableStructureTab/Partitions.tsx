import type { RelationNode } from '@shared/types/catalog';
import { partitionClause } from './structureModel';
import { EmptyNote } from './parts';

/** Placeholder until the catalog carries partition metadata (P6.4). Shows the partition key from the DDL when known. */
export function Partitions({ node, ddl }: { node: RelationNode; ddl: string | null }) {
  const clause = partitionClause(ddl);
  return (
    <div className="flex flex-1 flex-col">
      {clause ? (
        <div className="px-3 pt-3 text-[12.5px]">
          <span className="text-muted-foreground">Partition key of {node.schema}.{node.name}: </span>
          <code className="font-mono text-[12px]">{clause}</code>
        </div>
      ) : (
        <div className="px-3 pt-3 text-[12.5px] text-muted-foreground">Open the DDL sub-tab once to show the partition key.</div>
      )}
      <EmptyNote>Partition list (bounds, sizes, attach/detach) arrives with the server overview phase (P6.4).</EmptyNote>
    </div>
  );
}
