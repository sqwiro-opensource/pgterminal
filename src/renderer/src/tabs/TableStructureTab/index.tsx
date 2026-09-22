import { useMemo } from 'react';
import { Eye, Layers, Link2, RefreshCw, Table2 } from 'lucide-react';
import { iconColorFor } from '@renderer/lib/objectIcons';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { Tab, TabParamsByKind } from '@shared/types/workspace';
import { formatBytes, formatCount } from '@renderer/features/tree/treeModel';
import { IconButton } from '@renderer/components/ui/IconButton';
import { useRelationNode } from './useRelationNode';
import { kindLabel } from './structureModel';
import { workspace } from './workspaceBridge';
import { Badge, ErrorBox, LoadingRows, StructTable } from './parts';
import { Columns } from './Columns';
import { ColumnsEditor } from './ColumnsEditor';
import { StructureFormsHost } from './structureActions';
import { Indexes } from './Indexes';
import { Constraints } from './Constraints';
import { Triggers } from './Triggers';
import { Relations } from './Relations';
import { Partitions } from './Partitions';
import { Ddl, useDdl } from './Ddl';
import { useRefreshSignal } from '@renderer/tabs/useTab';

type Section = TabParamsByKind['table-structure']['section'];

const KIND_ICON = { table: Table2, view: Eye, matview: Layers, foreignTable: Link2, partitionedTable: Layers } as const;
const KIND_COLOR = {
  table: iconColorFor('table'),
  view: iconColorFor('view'),
  matview: iconColorFor('matview'),
  foreignTable: iconColorFor('foreignTable'),
  partitionedTable: iconColorFor('partitionedTable')
} as const;

export default function TableStructureTab({ tab: anyTab }: { tab: Tab }) {
  const tab = anyTab as Tab<'table-structure'>;
  const { connectionId, database, schema, table, section } = tab.params;
  const rel = useRelationNode({ connectionId, database, schema, table });
  useRefreshSignal(tab.id, rel.refresh);
  const node = rel.node;
  const ddl = useDdl(node, connectionId, database, section === 'ddl' || section === 'partitions');

  const sections = useMemo(() => {
    const n = node;
    const list: { id: Section; label: string; count?: number }[] = [
      { id: 'columns', label: 'Columns', count: n?.columns?.length },
      { id: 'indexes', label: 'Indexes', count: n?.indexes?.length },
      { id: 'constraints', label: 'Constraints', count: n?.constraints?.length },
      { id: 'triggers', label: 'Triggers', count: n?.triggers?.length },
      { id: 'relations', label: 'Relations' }
    ];
    if (n?.kind === 'partitionedTable') list.push({ id: 'partitions', label: 'Partitions' });
    list.push({ id: 'ddl', label: 'DDL' });
    return list;
  }, [node]);

  const setSection = (s: Section) => workspace().updateParams<'table-structure'>(tab.id, { section: s });
  const Icon = node ? KIND_ICON[node.kind] : Table2;
  const iconColor = node ? KIND_COLOR[node.kind] : iconColorFor('table');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <Icon size={14} strokeWidth={1.75} className={iconColor} />
        <span className="font-mono text-[13px] font-medium">
          <span className="text-muted-foreground">{schema}.</span>
          {table}
        </span>
        {node && (
          <>
            <Badge>{kindLabel(node.kind)}</Badge>
            {node.isHypertable && <Badge tone="info">hypertable</Badge>}
            <span className="font-mono text-[11px] text-muted-foreground">~{formatCount(node.estimatedRows)} rows</span>
            {node.sizeBytes && <span className="font-mono text-[11px] text-muted-foreground">{formatBytes(node.sizeBytes)}</span>}
            {node.comment && <span className="truncate text-[12px] text-muted-foreground" title={node.comment}>— {node.comment}</span>}
          </>
        )}
        <div className="flex-1" />
        <IconButton label="Refresh structure" size="sm" onClick={rel.refresh} disabled={rel.loading}>
          <RefreshCw size={13} strokeWidth={1.75} className={rel.loading ? 'animate-spin' : undefined} />
        </IconButton>
      </div>
      <div className="flex h-8 items-end gap-0.5 border-b border-border px-2" role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-t border border-b-0 px-2.5 text-[12px]',
              section === s.id ? 'border-border bg-background font-medium' : 'border-transparent text-muted-foreground hover:bg-accent'
            )}
          >
            {s.label}
            {s.count !== undefined && <span className="font-mono text-[10.5px] text-muted-foreground">{s.count}</span>}
          </button>
        ))}
      </div>
      {rel.error && <ErrorBox message={rel.error} onRetry={rel.refresh} />}
      {!node && !rel.error && (
        <StructTable headers={['Name', 'Type', 'Nullable', 'Default']}>
          <LoadingRows cols={4} />
        </StructTable>
      )}
      {node && section === 'columns' && (node.kind === 'table' || node.kind === 'partitionedTable' ? <ColumnsEditor key={node.loadedAt ?? 0} ctx={{ connectionId, database, node }} /> : <Columns node={node} />)}
      {node && section === 'indexes' && <Indexes node={node} connectionId={connectionId} database={database} />}
      {node && section === 'constraints' && <Constraints node={node} connectionId={connectionId} database={database} />}
      {node && section === 'triggers' && <Triggers node={node} connectionId={connectionId} database={database} />}
      {node && section === 'relations' && <Relations node={node} connectionId={connectionId} database={database} />}
      {node && section === 'partitions' && <Partitions node={node} ddl={ddl.sql} />}
      {node && section === 'ddl' && <Ddl state={ddl} />}
      <StructureFormsHost />
    </div>
  );
}
