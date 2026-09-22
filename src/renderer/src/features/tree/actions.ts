/**
 * Runtime implementation of TreeActionApi on top of the store, the confirm dialog and the workspace.
 * Action classes: DX run immediately; DDL open generated SQL in a tab; CF go through the confirm dialog.
 */
import { toast } from 'sonner';
import type { ColumnInfo, DdlRequest, RelationNode } from '@shared/types/catalog';
import type { ConnectionMeta } from '@shared/types/connection';
import type { Tab, TabKind, TabParamsByKind } from '@shared/types/workspace';
import { decodeNodeId, isRelationKind, type RelationKind } from '@shared/catalog/nodeId';
import { qualify, quoteIdent } from '@shared/sql/quote';
import { useStore } from '@renderer/store';
import { nodeKey } from '@renderer/store/catalog.slice';
import { confirm, type ConfirmSpec } from '@renderer/components/ui/ConfirmDialog';
import type { TreeActionApi } from './contextMenus';
import * as T from './sqlTemplates';
import { executeDdl, type DdlTarget } from './ddlActions';
import { openCreateTableDialog } from '@renderer/features/structure/CreateTableDialog';
import { formatBytes, formatCount, type TreeRow } from './treeModel';
import { copyText } from '@renderer/lib/clipboard';

/* ---------- workspace bridge (slice written by P2.1; accessed defensively) ---------- */

type OpenTabFn = <K extends TabKind>(
  kind: K,
  params: TabParamsByKind[K],
  opts?: { title?: string; focus?: boolean; reuse?: boolean }
) => string;

interface WorkspaceLike {
  openTab?: OpenTabFn;
  tabs?: Tab[];
  activeTabId?: string | null;
}

function workspace(): WorkspaceLike {
  return useStore.getState() as unknown as WorkspaceLike;
}

/** Opens a tab if the workspace slice is present; otherwise explains and returns false. */
export function openTab<K extends TabKind>(kind: K, params: TabParamsByKind[K], opts?: { title?: string; reuse?: boolean }): boolean {
  const ws = workspace();
  if (!ws.openTab) {
    toast.info('Tabs arrive with the workspace (P2.1)', { description: `${kind} · ${JSON.stringify(params).slice(0, 80)}` });
    return false;
  }
  ws.openTab(kind, params, { reuse: true, focus: true, ...opts });
  return true;
}

export function openQueryTab(p: { connectionId: string; database: string; sql: string; name?: string }): boolean {
  return openTab('query', { ...p, sessionId: crypto.randomUUID() }, { reuse: false, title: p.name });
}

/** Connection that owns the active tab, if any. */
export function selectActiveConnectionId(state: unknown): string | null {
  const ws = state as WorkspaceLike;
  const tab = ws.tabs?.find((t) => t.id === ws.activeTabId);
  const params = tab?.params as { connectionId?: string } | undefined;
  return params?.connectionId && params.connectionId !== 'all' ? params.connectionId : null;
}

/* ---------- helpers ---------- */

export interface RelRefFull extends T.RelRef {
  database: string;
  relKind: RelationKind;
  nodeId: string;
}

/** Schema/name/db for relation rows and their leaf children (column, index, constraint, trigger). */
export function relOf(row: TreeRow): RelRefFull | null {
  if (!row.nodeId) return null;
  try {
    const { kind, path } = decodeNodeId(row.nodeId);
    const [db, schema] = path;
    if (!db || !schema) return null;
    if (isRelationKind(kind) && path[2]) return { database: db, schema, name: path[2], relKind: kind, nodeId: row.nodeId };
    const relKind = path[2];
    const relName = path[3];
    if (relKind && relName && isRelationKind(relKind)) {
      return { database: db, schema, name: relName, relKind, nodeId: `${relKind}/${path.slice(0, 2).map(encodeURIComponent).join('/')}/${encodeURIComponent(relName)}` };
    }
  } catch {
    /* not a node id */
  }
  return null;
}

/** [db, schema, name, …] for any node row. */
function pathOf(row: TreeRow): string[] {
  if (!row.nodeId) return [];
  try {
    return decodeNodeId(row.nodeId).path;
  } catch {
    return [];
  }
}

function copy(text: string, what = 'Copied'): void {
  void copyText(text).then(
    () => toast.success(what, { description: text.length > 120 ? `${text.slice(0, 120)}…` : text }),
    () => toast.error('Clipboard unavailable')
  );
}

function metaOf(id: string): ConnectionMeta | undefined {
  return useStore.getState().connections[id];
}

async function relationColumns(row: TreeRow, rel: RelRefFull): Promise<ColumnInfo[]> {
  const st = useStore.getState();
  const cached = st.nodes[nodeKey(row.connectionId, rel.nodeId)] as RelationNode | undefined;
  if (cached?.columns) return cached.columns;
  const node = (await st.loadNode(row.connectionId, rel.database, rel.nodeId)) as RelationNode | undefined;
  return node?.columns ?? [];
}

/** Executes confirmed SQL inline (errors surface inside the dialog), closing tabs of dropped objects and refreshing the tree. */
function executeConfirmed(connectionId: string, database: string, sql: string, verb: string, target?: DdlTarget): Promise<void> {
  return executeDdl({ connectionId, database, sql, verb, target: target ?? { database } });
}

function confirmSpec(row: TreeRow, spec: Omit<ConfirmSpec, 'env' | 'connectionName' | 'typedName' | 'onOpenInEditor' | 'onConfirm'> & { typedName: string; database: string; target?: DdlTarget }): ConfirmSpec {
  const meta = metaOf(row.connectionId);
  const { settings } = useStore.getState();
  const needsTyped = meta?.env === 'prod' && settings.typedConfirmOnProd;
  return {
    ...spec,
    env: meta?.env,
    connectionName: meta?.name,
    typedName: needsTyped ? spec.typedName : undefined,
    onOpenInEditor: (sql) => openQueryTab({ connectionId: row.connectionId, database: spec.database, sql, name: spec.verb }),
    onConfirm: (sql) => executeConfirmed(row.connectionId, spec.database, sql, spec.verb, spec.target)
  };
}

function sizeSentence(row: TreeRow, node: RelationNode | undefined): string {
  const rows = node?.estimatedRows ? formatCount(node.estimatedRows) : row.meta ?? '';
  const size = node?.sizeBytes ? formatBytes(node.sizeBytes) : '';
  if (rows && size) return `about ${rows} rows (${size})`;
  if (rows) return `about ${rows} rows`;
  return 'its rows';
}

/* ---------- the actions ---------- */

export function createTreeActions(ui: { editConnection(id: string): void; newConnection(group?: string): void }): TreeActionApi {
  const s = () => useStore.getState();

  const ddlRequestFor = (row: TreeRow): DdlRequest | null => {
    const p = pathOf(row);
    const rel = relOf(row);
    const db = p[0];
    if (!db) return null;
    const base = { connectionId: row.connectionId, database: db };
    switch (row.kind) {
      case 'table':
      case 'partitionedTable':
      case 'foreignTable':
        return rel ? { ...base, kind: 'table', schema: rel.schema, name: rel.name } : null;
      case 'view':
      case 'matview':
        return rel ? { ...base, kind: row.kind, schema: rel.schema, name: rel.name } : null;
      case 'function':
      case 'procedure':
        return p[1] && p[2] ? { ...base, kind: 'function', schema: p[1], name: p[2] } : null;
      case 'schema':
        return p[1] ? { ...base, kind: 'schema', name: p[1] } : null;
      case 'index':
      case 'constraint':
      case 'trigger':
      case 'column':
        return rel && p[4] ? { ...base, kind: row.kind, schema: rel.schema, name: p[4], parent: rel.name } : null;
      default:
        return null;
    }
  };

  const withRel = (row: TreeRow, fn: (rel: RelRefFull) => void): void => {
    const rel = relOf(row);
    if (!rel) toast.error('Not a relation node');
    else fn(rel);
  };

  return {
    connect: (id) => void s().connect(id),
    disconnect: (id) => void s().disconnect(id),
    refreshDatabases: (id) => void s().disconnect(id).then(() => s().connect(id)).then(() => toast.success('Databases refreshed')),
    setReadOnly: (id, on) => {
      const meta = metaOf(id);
      if (!meta) return;
      const { hasPassword: _h, createdAt: _c, updatedAt: _u, ...input } = meta;
      void s()
        .saveConnection({ ...input, readOnly: on })
        .then(async () => {
          if (s().status[id]?.state === 'connected') {
            await s().disconnect(id);
            await s().connect(id);
          }
          toast.success(on ? 'Connection is now read-only' : 'Read-only cleared');
        })
        .catch((err: Error) => toast.error('Could not update connection', { description: err.message }));
    },
    editConnection: (id) => ui.editConnection(id),
    duplicateConnection: (id) => {
      const meta = metaOf(id);
      if (!meta) return;
      const { id: _id, hasPassword: _h, createdAt: _c, updatedAt: _u, ...input } = meta;
      void s()
        .saveConnection({ ...input, name: `${meta.name} (copy)` })
        .then((m) => {
          toast.success(`Duplicated as “${m.name}”`, { description: 'The password is not copied; set it in the form.' });
          ui.editConnection(m.id);
        })
        .catch((err: Error) => toast.error('Duplicate failed', { description: err.message }));
    },
    copyUri: (id) => {
      const m = metaOf(id);
      if (!m) return;
      copy(`postgresql://${encodeURIComponent(m.user)}@${m.host}:${m.port}/${encodeURIComponent(m.defaultDatabase)}?sslmode=${m.sslMode}`, 'URI copied');
    },
    deleteConnection: (id) => {
      const m = metaOf(id);
      if (!m) return;
      confirm({
        title: `Delete connection “${m.name}”`,
        verb: 'Delete connection',
        variant: 'destructive',
        env: m.env,
        connectionName: m.name,
        summary: 'This removes the saved password from the keychain. Open tabs on this connection will be closed.',
        buildSql: () => `-- not SQL: removes the saved connection “${m.name}” (${m.host}:${m.port})`,
        onConfirm: async () => {
          await s().deleteConnection(id);
          toast.success('Connection deleted');
        }
      });
    },
    newConnectionInGroup: (group) => ui.newConnection(group),
    connectAll: (group) => {
      for (const m of Object.values(s().connections)) if ((m.group ?? '') === group && s().status[m.id]?.state !== 'connected') void s().connect(m.id);
    },
    disconnectAll: (group) => {
      for (const m of Object.values(s().connections)) if ((m.group ?? '') === group && s().status[m.id]?.state === 'connected') void s().disconnect(m.id);
    },
    collapse: (row) => s().toggleExpanded(row.key, false),

    openDatabase: (row) => {
      if (!row.database) return;
      s().openDatabase(row.connectionId, row.database);
      s().toggleExpanded(row.key, true);
    },
    closeDatabase: (row) => row.database && s().closeDatabase(row.connectionId, row.database),
    refreshNode: (row) => {
      if (row.nodeId && row.database) void s().loadNode(row.connectionId, row.database, row.nodeId, true);
      else if (row.kind === 'server') void s().disconnect(row.connectionId).then(() => s().connect(row.connectionId));
    },
    copyName: (row) => copy(row.label),
    copyQualifiedName: (row) => {
      const rel = relOf(row);
      const p = pathOf(row);
      if (rel && (row.kind === 'function' || row.kind === 'procedure')) copy(`${qualify(rel.schema, rel.name)}(${p[3] ?? ''})`);
      else if (row.kind === 'function' || row.kind === 'procedure') copy(p[1] && p[2] ? `${qualify(p[1], p[2])}(${p[3] ?? ''})` : row.label);
      else if (rel) copy(qualify(rel.schema, rel.name));
      else copy(row.label);
    },
    copyChildNames: (row) => {
      const node = row.nodeId ? s().nodes[nodeKey(row.connectionId, row.nodeId)] : undefined;
      const rel = relOf(row);
      const relNode = rel ? (s().nodes[nodeKey(row.connectionId, rel.nodeId)] as RelationNode | undefined) : undefined;
      const names =
        row.kind === 'columnsGroup' ? relNode?.columns?.map((c) => c.name)
        : row.kind === 'indexesGroup' ? relNode?.indexes?.map((c) => c.name)
        : row.kind === 'constraintsGroup' ? relNode?.constraints?.map((c) => c.name)
        : row.kind === 'triggersGroup' ? relNode?.triggers?.map((c) => c.name)
        : node?.children?.map((c) => c.name);
      if (!names?.length) toast.info('Nothing loaded to copy');
      else copy(names.join('\n'), `${names.length} names copied`);
    },
    openData: (row) =>
      withRel(row, (rel) =>
        openTab(
          'table-data',
          { connectionId: row.connectionId, database: rel.database, schema: rel.schema, table: rel.name, filters: [], sort: [], page: { mode: 'offset', offset: 0 } },
          { title: rel.name }
        )
      ),
    openStructure: (row, section = 'columns') =>
      withRel(row, (rel) =>
        openTab('table-structure', { connectionId: row.connectionId, database: rel.database, schema: rel.schema, table: rel.name, section }, { title: `${rel.name} · structure` })
      ),
    openOverview: (id) => openTab('server-overview', { connectionId: id }, { title: metaOf(id)?.name }),
    newQuery: (row) => {
      const p = pathOf(row);
      const db = row.database ?? p[0] ?? metaOf(row.connectionId)?.defaultDatabase ?? 'postgres';
      const schema = row.kind === 'schema' ? p[1] : undefined;
      const sql = schema ? `SET search_path TO ${quoteIdent(schema)}, public;\n\n` : '';
      openQueryTab({ connectionId: row.connectionId, database: db, sql });
    },
    refreshMatview: (row, concurrently) =>
      withRel(row, (rel) =>
        void executeConfirmed(row.connectionId, rel.database, T.refreshMatviewSql(rel, concurrently), 'Refresh materialized view', { database: rel.database, schema: rel.schema, name: rel.name }).catch((e: Error) => toast.error(e.message))
      ),

    ddlPreview: (row) => {
      const ddl = ddlRequestFor(row);
      if (!ddl) return void toast.error('No DDL for this node');
      openTab('ddl-preview', { connectionId: row.connectionId, database: ddl.database, ddl }, { title: `DDL · ${ddl.name}` });
    },
    generate: (row, kind) =>
      withRel(row, (rel) => {
        void relationColumns(row, rel).then((cols) => {
          const sql =
            kind === 'select' ? T.selectSql(rel, cols) : kind === 'insert' ? T.insertSql(rel, cols) : kind === 'update' ? T.updateSql(rel, cols) : T.deleteSql(rel, cols);
          openQueryTab({ connectionId: row.connectionId, database: rel.database, sql, name: `${kind.toUpperCase()} ${rel.name}` });
        });
      }),
    createTemplate: (row, what) => {
      const p = pathOf(row);
      const db = row.database ?? p[0] ?? metaOf(row.connectionId)?.defaultDatabase ?? 'postgres';
      const schema = p[1] ?? 'public';
      if (what === 'table') return openCreateTableDialog({ connectionId: row.connectionId, database: db, schema });
      const sql =
        what === 'view' ? T.createViewTemplate(schema)
        : what === 'function' ? T.createFunctionTemplate(schema)
        : what === 'schema' ? T.createSchemaTemplate()
        : what === 'database' ? T.createDatabaseTemplate()
        : T.createExtensionTemplate();
      openQueryTab({ connectionId: row.connectionId, database: db, sql, name: `Create ${what}` });
    },
    editView: (row) =>
      withRel(row, (rel) => {
        const node = s().nodes[nodeKey(row.connectionId, rel.nodeId)] as RelationNode | undefined;
        const go = (def?: string) => openQueryTab({ connectionId: row.connectionId, database: rel.database, sql: T.editViewSql(rel, def, row.kind === 'matview'), name: `Edit ${rel.name}` });
        if (node?.viewDefinition) go(node.viewDefinition);
        else void s().loadNode(row.connectionId, rel.database, rel.nodeId).then((n) => go((n as RelationNode | undefined)?.viewDefinition));
      }),
    editFunction: (row) => {
      const ddl = ddlRequestFor(row);
      if (!ddl) return;
      openTab('ddl-preview', { connectionId: row.connectionId, database: ddl.database, ddl }, { title: `Edit · ${ddl.name}` });
    },
    selectFromFunction: (row) => {
      const p = pathOf(row);
      if (!p[0] || !p[1] || !p[2]) return;
      openQueryTab({ connectionId: row.connectionId, database: p[0], sql: T.selectFromFunctionSql({ schema: p[1], name: p[2] }, p[3] ?? ''), name: `Execute ${p[2]}` });
    },

    confirmDrop: (row) => {
      const p = pathOf(row);
      const rel = relOf(row);
      const db = row.database ?? p[0] ?? '';
      const target = rel ? qualify(rel.schema, rel.name) : row.label;
      const leaf = p[4];
      const dropTarget: DdlTarget = rel ? { database: db, schema: rel.schema, name: rel.name, dropped: !leaf } : { database: db, schema: p[1], name: p[2], dropped: row.kind !== 'schema' && row.kind !== 'database' && row.kind !== 'extension' };
      const dropSpec = (title: string, verb: string, summary: string, build: (o: Record<string, boolean>) => string, typed: string, extraOptions: T.DropOptions & { cascade?: boolean } = {}) =>
        confirm(
          confirmSpec(row, {
            title,
            verb,
            variant: 'destructive',
            summary,
            database: db,
            target: row.kind === 'schema' ? { database: db, schema: p[1], dropped: true } : dropTarget,
            typedName: typed,
            options: [
              { key: 'cascade', label: 'CASCADE (drop dependents)', checked: extraOptions.cascade ?? false },
              { key: 'ifExists', label: 'IF EXISTS', checked: false }
            ],
            buildSql: build
          })
        );
      switch (row.kind) {
        case 'table':
        case 'partitionedTable':
        case 'foreignTable':
        case 'view':
        case 'matview':
        case 'sequence':
        case 'type':
        case 'function':
        case 'procedure': {
          const node = rel ? (s().nodes[nodeKey(row.connectionId, rel.nodeId)] as RelationNode | undefined) : undefined;
          const isTable = row.kind === 'table' || row.kind === 'partitionedTable' || row.kind === 'foreignTable';
          const kind = row.kind as T.DropKind;
          const name = rel ? qualify(rel.schema, rel.name) : p[1] && p[2] ? qualify(p[1], p[2]) : row.label;
          const words = isTable ? `This permanently deletes ${sizeSentence(row, node)}.` : `This permanently drops ${row.kind} ${name}.`;
          const args = row.kind === 'function' || row.kind === 'procedure' ? `(${p[3] ?? ''})` : '';
          dropSpec(`Drop ${kindWord(row.kind)} ${name}`, `Drop ${kindWord(row.kind)}`, words, (o) => T.dropSql(kind, name + args, o), rel?.name ?? p[2] ?? row.label);
          return;
        }
        case 'schema':
          dropSpec(`Drop schema ${p[1] ?? row.label}`, 'Drop schema', 'This permanently drops the schema and, with CASCADE, every object in it.', (o) => T.dropSql('schema', quoteIdent(p[1] ?? row.label), o), p[1] ?? row.label);
          return;
        case 'database':
          confirm(
            confirmSpec(row, {
              title: `Drop database ${row.label}`,
              verb: 'Drop database',
              variant: 'destructive',
              summary: `This permanently deletes the database ${row.label}${row.meta ? ` (${row.meta})` : ''}. Active sessions must be terminated first; pgterminal will refuse while its own pools are open.`,
              database: metaOf(row.connectionId)?.defaultDatabase ?? 'postgres',
              typedName: row.label,
              options: [{ key: 'ifExists', label: 'IF EXISTS', checked: false }],
              buildSql: (o) => T.dropSql('database', quoteIdent(row.label), { ifExists: o.ifExists })
            })
          );
          return;
        case 'extension':
          dropSpec(`Drop extension ${row.label}`, 'Drop extension', `This drops the extension ${row.label} and, with CASCADE, objects that depend on it.`, (o) => T.dropSql('extension', quoteIdent(row.label), o), row.label);
          return;
        case 'column':
          if (rel && leaf) dropSpec(`Drop column ${target}.${leaf}`, 'Drop column', `This permanently removes column ${leaf} and its data from ${target}.`, (o) => T.dropColumnSql(rel, leaf, o.cascade), leaf);
          return;
        case 'index':
          if (rel && leaf) dropSpec(`Drop index ${leaf}`, 'Drop index', `This drops index ${leaf} on ${target}.`, (o) => T.dropSql('index', qualify(rel.schema, leaf), o), leaf);
          return;
        case 'constraint':
          if (rel && leaf) dropSpec(`Drop constraint ${leaf}`, 'Drop constraint', `This drops constraint ${leaf} from ${target}.`, (o) => T.dropConstraintSql(rel, leaf, o.cascade), leaf);
          return;
        case 'trigger':
          if (rel && leaf) dropSpec(`Drop trigger ${leaf}`, 'Drop trigger', `This drops trigger ${leaf} on ${target}.`, (o) => T.dropTriggerSql(rel, leaf, o.cascade), leaf);
          return;
        default:
          toast.error('Nothing to drop here');
      }
    },
    confirmTruncate: (row) =>
      withRel(row, (rel) => {
        const node = s().nodes[nodeKey(row.connectionId, rel.nodeId)] as RelationNode | undefined;
        confirm(
          confirmSpec(row, {
            title: `Truncate ${qualify(rel.schema, rel.name)}`,
            verb: 'Truncate table',
            variant: 'destructive',
            summary: `This removes ${sizeSentence(row, node)} from ${qualify(rel.schema, rel.name)}. It cannot be undone.`,
            database: rel.database,
            target: { database: rel.database, schema: rel.schema, name: rel.name },
            typedName: rel.name,
            options: [
              { key: 'restartIdentity', label: 'RESTART IDENTITY', checked: false },
              { key: 'cascade', label: 'CASCADE', checked: false }
            ],
            buildSql: (o) => T.truncateSql(rel, { restartIdentity: o.restartIdentity, cascade: o.cascade })
          })
        );
      }),
    confirmRename: (row) => {
      const p = pathOf(row);
      const rel = relOf(row);
      const current = rel ? rel.name : p[1] ?? row.label;
      const next = window.prompt(`Rename ${current} to:`, current);
      if (!next || next === current) return;
      const kind: 'table' | 'view' | 'matview' | 'schema' = row.kind === 'view' ? 'view' : row.kind === 'matview' ? 'matview' : row.kind === 'schema' ? 'schema' : 'table';
      const target = rel ? qualify(rel.schema, rel.name) : quoteIdent(current);
      confirm(
        confirmSpec(row, {
          title: `Rename ${current} → ${next}`,
          verb: 'Rename',
          variant: 'neutral',
          summary: `Dependent views and functions keep working; saved queries that name ${current} will not.`,
          database: rel?.database ?? p[0] ?? '',
          typedName: current,
          buildSql: () => T.renameSql(kind, target, next)
        })
      );
    },
    confirmRestartSequence: (row) => {
      const p = pathOf(row);
      if (!p[0] || !p[1] || !p[2]) return;
      const rel = { schema: p[1], name: p[2] };
      confirm(
        confirmSpec(row, {
          title: `Restart sequence ${qualify(rel.schema, rel.name)}`,
          verb: 'Restart sequence',
          variant: 'light',
          summary: 'The sequence restarts from its start value. Rows inserted later may collide with existing keys.',
          database: p[0],
          typedName: rel.name,
          buildSql: () => T.restartSequenceSql(rel)
        })
      );
    }
  };
}

function kindWord(kind: TreeRow['kind']): string {
  switch (kind) {
    case 'partitionedTable':
      return 'partitioned table';
    case 'foreignTable':
      return 'foreign table';
    case 'matview':
      return 'materialized view';
    default:
      return kind;
  }
}
