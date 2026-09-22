import { useEffect, useState } from 'react';
import { Columns3, Table2 } from 'lucide-react';
import { useStore } from '@renderer/store';
import { isRelationKind, nodeIds } from '@shared/catalog/nodeId';
import type { RelationNode } from '@shared/types/catalog';
import { fkTargets, referencedBy, type Backlink } from './structureModel';
import { Cell, EmptyNote, Row, StructTable, TargetChip } from './parts';
import { openData, openStructure } from './workspaceBridge';

const SCAN_LIMIT = 50;

interface Scan {
  done: number;
  total: number;
  links: Backlink[];
  finished: boolean;
  error: string | null;
}

/** Loads every table of the schema (max 50) and collects FKs that point at `node`. */
function useReferencedBy(node: RelationNode, connectionId: string, database: string): Scan {
  const loadNode = useStore((s) => s.loadNode);
  const [scan, setScan] = useState<Scan>({ done: 0, total: 0, links: [], finished: false, error: null });
  useEffect(() => {
    let cancelled = false;
    setScan({ done: 0, total: 0, links: [], finished: false, error: null });
    void (async () => {
      const group = await loadNode(connectionId, database, nodeIds.group('tablesGroup', database, node.schema));
      const rels = (group?.children ?? []).filter((c) => isRelationKind(c.kind)).slice(0, SCAN_LIMIT);
      if (cancelled) return;
      if (!group) {
        setScan((s) => ({ ...s, finished: true, error: `Could not load schema ${node.schema}` }));
        return;
      }
      setScan((s) => ({ ...s, total: rels.length }));
      const loaded: RelationNode[] = [];
      for (const r of rels) {
        if (cancelled) return;
        if (!isRelationKind(r.kind)) continue;
        const n = await loadNode(connectionId, database, nodeIds.relation(r.kind, database, node.schema, r.name));
        if (n && isRelationKind(n.kind)) loaded.push(n as RelationNode);
        if (cancelled) return;
        setScan((s) => ({ ...s, done: s.done + 1, links: referencedBy(loaded, node.schema, node.name) }));
      }
      if (!cancelled) setScan((s) => ({ ...s, finished: true }));
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId, database, node.schema, node.name, loadNode]);
  return scan;
}

function Actions({ schema, table, connectionId, database }: { schema: string; table: string; connectionId: string; database: string }) {
  return (
    <span className="inline-flex gap-1">
      <button type="button" title="Open structure" onClick={() => openStructure(connectionId, database, schema, table)} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
        <Columns3 size={14} strokeWidth={1.75} />
      </button>
      <button type="button" title="Open data" onClick={() => openData(connectionId, database, schema, table)} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
        <Table2 size={14} strokeWidth={1.75} />
      </button>
    </span>
  );
}

export function Relations({ node, connectionId, database }: { node: RelationNode; connectionId: string; database: string }) {
  const out = fkTargets(node.constraints);
  const scan = useReferencedBy(node, connectionId, database);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">References ({out.length})</div>
      {out.length === 0 ? (
        <EmptyNote>This relation has no foreign keys</EmptyNote>
      ) : (
        <StructTable className="flex-none" headers={['Constraint', 'Columns', 'Target', 'Target columns', '']}>
          {out.map((t, i) => (
            <Row key={t.constraint} index={i}>
              <Cell className="font-medium">{t.constraint}</Cell>
              <Cell mono>{t.columns.join(', ')}</Cell>
              <Cell>
                <TargetChip schema={t.schema} table={t.table} onClick={() => openStructure(connectionId, database, t.schema, t.table)} />
              </Cell>
              <Cell mono muted>{t.refColumns.join(', ')}</Cell>
              <Cell className="w-16">
                <Actions schema={t.schema} table={t.table} connectionId={connectionId} database={database} />
              </Cell>
            </Row>
          ))}
        </StructTable>
      )}
      <div className="flex items-center gap-2 px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
        Referenced by ({scan.links.length})
        {!scan.finished && scan.total > 0 && <span className="font-mono normal-case tracking-normal">scanning {scan.done}/{scan.total}</span>}
        {scan.finished && scan.total >= SCAN_LIMIT && <span className="font-normal normal-case tracking-normal">(first {SCAN_LIMIT} tables of {node.schema})</span>}
      </div>
      {scan.error && <EmptyNote>{scan.error}</EmptyNote>}
      {!scan.error && scan.finished && scan.links.length === 0 && <EmptyNote>No foreign keys in schema {node.schema} point at this relation</EmptyNote>}
      {scan.links.length > 0 && (
        <StructTable className="flex-none" headers={['Table', 'Via constraint', 'Columns', 'Referenced columns', '']}>
          {scan.links.map((l, i) => (
            <Row key={`${l.schema}.${l.table}.${l.constraint}`} index={i}>
              <Cell>
                <TargetChip schema={l.schema} table={l.table} onClick={() => openStructure(connectionId, database, l.schema, l.table)} />
              </Cell>
              <Cell className="font-medium">{l.constraint}</Cell>
              <Cell mono>{l.columns.join(', ')}</Cell>
              <Cell mono muted>{l.refColumns.join(', ')}</Cell>
              <Cell className="w-16">
                <Actions schema={l.schema} table={l.table} connectionId={connectionId} database={database} />
              </Cell>
            </Row>
          ))}
        </StructTable>
      )}
    </div>
  );
}
