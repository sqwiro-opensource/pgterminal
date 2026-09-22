import type { ConnectionMeta, DatabaseInfo, EnvLabel } from '@shared/types/connection';
import type {
  CatalogNode,
  CatalogNodeBase,
  DatabaseNode,
  NodeKind,
  RelationNode,
  SchemaNode
} from '@shared/types/catalog';
import { decodeNodeId, isRelationKind, nodeIds, type RelationKind } from '@shared/catalog/nodeId';
import type { NodeKey } from '@renderer/store/catalog.slice';

/** Subset of the connections slice the tree needs. */
export interface TreeConnStatus {
  state: 'idle' | 'connecting' | 'connected' | 'error';
  databases?: DatabaseInfo[];
  openDatabases: string[];
  error?: { message: string } | string;
}

/** Everything flattenTree reads. Kept structural so tests can build it without the store. */
export interface TreeState {
  connections: Record<string, ConnectionMeta>;
  status: Record<string, TreeConnStatus | undefined>;
  nodes: Record<NodeKey, CatalogNode>;
  loading: Record<NodeKey, boolean>;
  errors: Record<NodeKey, string | undefined>;
  expanded: Record<NodeKey, boolean>;
  activeConnectionId?: string | null;
}

export type RowKind = 'group' | 'server' | 'database' | 'more' | 'hint' | 'extensionsGroup' | NodeKind;

export interface TreeRow {
  key: NodeKey;
  depth: number;
  kind: RowKind;
  label: string;
  meta?: string;
  connectionId: string;
  database?: string;
  nodeId?: string;
  expanded: boolean;
  hasChildren: boolean;
  loading: boolean;
  error?: string;
  status?: 'on' | 'off' | 'busy' | 'err';
  env?: EnvLabel;
  readOnly?: boolean;
  isActive?: boolean;
  isOpen?: boolean;
  pk?: boolean;
  matches?: boolean;
  /** Index of the parent row in the returned array, -1 for roots. */
  parent: number;
}

const GROUP_LABELS: Partial<Record<NodeKind, string>> = {
  tablesGroup: 'Tables',
  viewsGroup: 'Views',
  functionsGroup: 'Functions',
  sequencesGroup: 'Sequences',
  typesGroup: 'Types',
  columnsGroup: 'Columns',
  indexesGroup: 'Indexes',
  constraintsGroup: 'Constraints',
  triggersGroup: 'Triggers'
};

const UNOPENED_DB_LIMIT = 8;

export function formatCount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return String(Math.round(n));
  const units = [
    { div: 1e9, suffix: 'B' },
    { div: 1e6, suffix: 'M' },
    { div: 1e3, suffix: 'k' }
  ];
  for (const u of units) {
    if (n >= u.div) {
      const v = n / u.div;
      return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}${u.suffix}`;
    }
  }
  return String(n);
}

export function formatBytes(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return i === 0 ? `${Math.round(v)} ${units[i]}` : `${v.toFixed(1)} ${units[i]}`;
}

function statusOf(s: TreeConnStatus | undefined): TreeRow['status'] {
  switch (s?.state) {
    case 'connected':
      return 'on';
    case 'connecting':
      return 'busy';
    case 'error':
      return 'err';
    default:
      return 'off';
  }
}

function relationMeta(n: Partial<RelationNode> & CatalogNodeBase): string | undefined {
  if (n.estimatedRows !== undefined && n.estimatedRows !== null && n.estimatedRows !== '') {
    const c = formatCount(n.estimatedRows);
    if (c) return c;
  }
  if (n.sizeBytes) return formatBytes(n.sizeBytes);
  return undefined;
}

class Builder {
  rows: TreeRow[] = [];
  constructor(
    readonly state: TreeState,
    readonly filtering: boolean
  ) {}

  isExpanded(key: NodeKey, fallback = false): boolean {
    if (this.filtering) return true;
    return this.state.expanded[key] ?? fallback;
  }

  push(row: Omit<TreeRow, 'parent'>, parent: number): number {
    this.rows.push({ ...row, parent });
    return this.rows.length - 1;
  }

  nodeRow(
    connectionId: string,
    database: string,
    nodeId: string,
    base: { depth: number; kind: RowKind; label: string; meta?: string; hasChildren: boolean; pk?: boolean },
    parent: number,
    defaultExpanded = false
  ): { index: number; expanded: boolean; node: CatalogNode | undefined } {
    const key = `${connectionId}:${nodeId}` as NodeKey;
    const node = this.state.nodes[key];
    const expanded = base.hasChildren && this.isExpanded(key, defaultExpanded);
    const index = this.push(
      {
        key,
        connectionId,
        database,
        nodeId,
        expanded,
        loading: !!this.state.loading[key],
        error: this.state.errors[key],
        ...base
      },
      parent
    );
    return { index, expanded, node };
  }

  build(): TreeRow[] {
    const groups = new Map<string, ConnectionMeta[]>();
    for (const meta of Object.values(this.state.connections)) {
      const g = meta.group?.trim() ?? '';
      const list = groups.get(g) ?? [];
      list.push(meta);
      groups.set(g, list);
    }
    const names = [...groups.keys()].sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    for (const g of names) {
      const conns = (groups.get(g) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      const key = `group:${g === '' ? '__ungrouped' : g}` as NodeKey;
      const expanded = this.isExpanded(key, true);
      const gi = this.push(
        {
          key,
          depth: 0,
          kind: 'group',
          label: g === '' ? 'Ungrouped' : g,
          meta: String(conns.length),
          connectionId: '',
          expanded,
          hasChildren: conns.length > 0,
          loading: false
        },
        -1
      );
      if (!expanded) continue;
      for (const meta of conns) this.server(meta, gi);
    }
    return this.rows;
  }

  server(meta: ConnectionMeta, parent: number): void {
    const st = this.state.status[meta.id];
    const connected = st?.state === 'connected';
    const dbs = (st?.databases ?? []).filter((d) => d.allowConn && !d.isTemplate);
    const key = `${meta.id}:server` as NodeKey;
    const expanded = connected && this.isExpanded(key, true);
    const si = this.push(
      {
        key,
        depth: 1,
        kind: 'server',
        label: meta.name,
        connectionId: meta.id,
        expanded,
        hasChildren: connected && dbs.length > 0,
        loading: st?.state === 'connecting',
        error: st?.state === 'error' ? (typeof st.error === 'string' ? st.error : st.error?.message) : undefined,
        status: statusOf(st),
        env: meta.env,
        readOnly: meta.readOnly,
        isActive: this.state.activeConnectionId === meta.id
      },
      parent
    );
    if (!expanded) return;
    const open = new Set(st?.openDatabases ?? []);
    const opened = dbs.filter((d) => open.has(d.name));
    const rest = dbs.filter((d) => !open.has(d.name));
    for (const d of opened) this.database(meta.id, d, true, si);
    const moreKey = `${meta.id}:more` as NodeKey;
    const showAll = this.isExpanded(moreKey, false);
    const visible = showAll ? rest : rest.slice(0, UNOPENED_DB_LIMIT);
    for (const d of visible) this.database(meta.id, d, false, si);
    if (!showAll && rest.length > UNOPENED_DB_LIMIT) {
      this.push(
        {
          key: moreKey,
          depth: 2,
          kind: 'more',
          label: `… ${rest.length - UNOPENED_DB_LIMIT} more databases`,
          connectionId: meta.id,
          expanded: false,
          hasChildren: false,
          loading: false
        },
        si
      );
    }
  }

  database(connectionId: string, d: DatabaseInfo, isOpen: boolean, parent: number): void {
    const nodeId = nodeIds.database(d.name);
    const { index, expanded, node } = this.nodeRow(
      connectionId,
      d.name,
      nodeId,
      { depth: 2, kind: 'database', label: d.name, meta: formatBytes(d.sizeBytes), hasChildren: isOpen },
      parent,
      true
    );
    const row = this.rows[index];
    if (row) row.isOpen = isOpen;
    if (!expanded || !node || node.kind !== 'database') return;
    const dbNode = node as DatabaseNode;
    for (const s of dbNode.schemas ?? []) this.schema(connectionId, d.name, s, index);
    const extensions = (dbNode.children ?? []).filter((c) => c.kind === 'extension');
    if (extensions.length > 0) {
      const key = `${connectionId}:extensionsGroup/${encodeURIComponent(d.name)}` as NodeKey;
      const exp = this.isExpanded(key, false);
      const ei = this.push(
        {
          key,
          depth: 3,
          kind: 'extensionsGroup',
          label: 'Extensions',
          meta: String(extensions.length),
          connectionId,
          database: d.name,
          expanded: exp,
          hasChildren: true,
          loading: false
        },
        index
      );
      if (exp) {
        for (const e of extensions) {
          this.push(
            {
              key: `${connectionId}:${e.id}` as NodeKey,
              depth: 4,
              kind: 'extension',
              label: e.name,
              connectionId,
              database: d.name,
              nodeId: e.id,
              expanded: false,
              hasChildren: false,
              loading: false
            },
            ei
          );
        }
      }
    }
  }

  schema(connectionId: string, database: string, s: SchemaNode, parent: number): void {
    const { index, expanded, node } = this.nodeRow(
      connectionId,
      database,
      s.id,
      { depth: 3, kind: 'schema', label: s.name, hasChildren: true },
      parent
    );
    if (!expanded) return;
    const children = (node as SchemaNode | undefined)?.children ?? s.children;
    if (!children) {
      if (this.filtering && !node) {
        this.push(
          {
            key: `${connectionId}:hint/${encodeURIComponent(s.id)}` as NodeKey,
            depth: 4,
            kind: 'hint',
            label: 'Load schema to search',
            connectionId,
            database,
            expanded: false,
            hasChildren: false,
            loading: false
          },
          index
        );
      }
      return;
    }
    for (const g of children) {
      const label = GROUP_LABELS[g.kind] ?? g.name;
      const count = g.count ?? g.children?.length;
      this.folder(connectionId, database, g, label, count, index);
    }
  }

  folder(
    connectionId: string,
    database: string,
    g: CatalogNodeBase,
    label: string,
    count: number | undefined,
    parent: number
  ): void {
    const { index, expanded, node } = this.nodeRow(
      connectionId,
      database,
      g.id,
      {
        depth: 4,
        kind: g.kind,
        label,
        meta: count === undefined ? undefined : String(count),
        hasChildren: count === undefined || count > 0
      },
      parent
    );
    if (!expanded) return;
    const children = node?.children ?? g.children ?? [];
    for (const c of children) this.object(connectionId, database, c, index);
  }

  object(connectionId: string, database: string, c: CatalogNodeBase, parent: number): void {
    if (isRelationKind(c.kind)) {
      this.relation(connectionId, database, c as Partial<RelationNode> & CatalogNodeBase, parent);
      return;
    }
    this.push(
      {
        key: `${connectionId}:${c.id}` as NodeKey,
        depth: 5,
        kind: c.kind,
        label: c.name,
        meta: c.kind === 'function' || c.kind === 'procedure' ? routineMeta(c) : undefined,
        connectionId,
        database,
        nodeId: c.id,
        expanded: false,
        hasChildren: false,
        loading: false
      },
      parent
    );
  }

  relation(connectionId: string, database: string, c: Partial<RelationNode> & CatalogNodeBase, parent: number): void {
    const { index, expanded, node } = this.nodeRow(
      connectionId,
      database,
      c.id,
      { depth: 5, kind: c.kind, label: c.name, meta: relationMeta(c), hasChildren: true },
      parent
    );
    if (!expanded || !node || !isRelationKind(node.kind)) return;
    const rel = node as RelationNode;
    const { path } = decodeNodeId(c.id);
    const schema = path[1] ?? rel.schema;
    const relKind = c.kind as RelationKind;
    const subs: Array<{ kind: 'columnsGroup' | 'indexesGroup' | 'constraintsGroup' | 'triggersGroup'; items: TreeRowLeaf[] }> = [
      { kind: 'columnsGroup', items: (rel.columns ?? []).map((x) => ({ name: x.name, meta: x.dataType, pk: x.isPk })) },
      { kind: 'indexesGroup', items: (rel.indexes ?? []).map((x) => ({ name: x.name, meta: `${x.method}${x.isUnique ? ' · unique' : ''}` })) },
      { kind: 'constraintsGroup', items: (rel.constraints ?? []).map((x) => ({ name: x.name, meta: CONSTRAINT_LABEL[x.type] })) },
      { kind: 'triggersGroup', items: (rel.triggers ?? []).map((x) => ({ name: x.name, meta: x.events.join(', ') })) }
    ];
    for (const sub of subs) {
      const gid = nodeIds.relGroup(sub.kind, database, schema, relKind, c.name);
      const key = `${connectionId}:${gid}` as NodeKey;
      const exp = sub.items.length > 0 && this.isExpanded(key, false);
      const gi = this.push(
        {
          key,
          depth: 6,
          kind: sub.kind,
          label: GROUP_LABELS[sub.kind] ?? sub.kind,
          meta: String(sub.items.length),
          connectionId,
          database,
          nodeId: gid,
          expanded: exp,
          hasChildren: sub.items.length > 0,
          loading: false
        },
        index
      );
      if (!exp) continue;
      const leafKind = LEAF_KIND[sub.kind];
      for (const item of sub.items) {
        const lid = nodeIds.relChild(leafKind, database, schema, relKind, c.name, item.name);
        this.push(
          {
            key: `${connectionId}:${lid}` as NodeKey,
            depth: 7,
            kind: leafKind,
            label: item.name,
            meta: item.meta,
            pk: item.pk,
            connectionId,
            database,
            nodeId: lid,
            expanded: false,
            hasChildren: false,
            loading: false
          },
          gi
        );
      }
    }
  }
}

interface TreeRowLeaf {
  name: string;
  meta?: string;
  pk?: boolean;
}

const LEAF_KIND = {
  columnsGroup: 'column',
  indexesGroup: 'index',
  constraintsGroup: 'constraint',
  triggersGroup: 'trigger'
} as const;

const CONSTRAINT_LABEL: Record<'p' | 'f' | 'u' | 'c' | 'x', string> = {
  p: 'primary key',
  f: 'foreign key',
  u: 'unique',
  c: 'check',
  x: 'exclusion'
};

function routineMeta(c: CatalogNodeBase): string | undefined {
  const args = (c as { args?: string }).args;
  return args === undefined ? undefined : `(${args.length > 24 ? args.slice(0, 22) + '…' : args})`;
}

/** Flattens connections + catalog into visible rows. With a filter, loaded ancestors auto-expand and only matches (plus ancestors) remain. */
export function flattenTree(state: TreeState, filter = ''): TreeRow[] {
  const q = filter.trim().toLowerCase();
  const rows = new Builder(state, q.length > 0).build();
  if (q.length === 0) return rows;
  const keep = new Array<boolean>(rows.length).fill(false);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    r.matches = r.label.toLowerCase().includes(q);
    const forced = r.kind === 'hint' || (r.kind === 'schema' && !state.nodes[r.key]);
    if (r.matches || forced) {
      let j: number = i;
      while (j >= 0 && !keep[j]) {
        keep[j] = true;
        j = rows[j]!.parent;
      }
    }
  }
  const remap = new Map<number, number>();
  const out: TreeRow[] = [];
  rows.forEach((r, i) => {
    if (!keep[i]) return;
    remap.set(i, out.length);
    out.push({ ...r, parent: r.parent < 0 ? -1 : (remap.get(r.parent) ?? -1) });
  });
  return out;
}
