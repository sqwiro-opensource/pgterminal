import type {
  CatalogInvalidatedEvent,
  CatalogNode,
  CatalogNodeBase,
  ColumnInfo,
  CompletionIndex,
  ConstraintInfo,
  DatabaseNode,
  FunctionNode,
  HypertableInfo,
  IndexInfo,
  RelationNode,
  SchemaNode,
  TriggerInfo
} from '@shared/types/catalog';
import type { ServerInfo } from '@shared/types/connection';
import {
  decodeNodeId,
  isRelationKind,
  nodeIdMatches,
  nodeIds,
  parentNodeId,
  type RelationKind
} from '@shared/catalog/nodeId';
import { buildCompletionIndex } from './CompletionIndex';
import { hypertableInfoSql } from './sql/timescale.sql';
import type { PoolProvider, Queryable } from './Queryable';
import { push } from '@main/ipc/handle';
import {
  columnsSql,
  constraintsSql,
  decodeTriggerType,
  extensionsSql,
  functionDefinitionSql,
  hasTimescaleSql,
  hypertablesSql,
  indexesSql,
  parseSearchPath,
  relationSql,
  relationsSql,
  routinesSql,
  schemasSql,
  sequencesSql,
  serverInfoSql,
  triggersSql,
  typesSql
} from './sql';

export interface GetNodeOptions {
  connectionId: string;
  database: string;
  nodeId: string;
  refresh?: boolean;
  /** Include pg_catalog, information_schema and timescaledb internals. */
  showInternal?: boolean;
}

/** Leaf/child nodes may carry their detail row so the tree can show it without another call. */
export type DetailedNode = CatalogNodeBase & { detail?: unknown };

interface CacheEntry {
  node: CatalogNode;
  loadedAt: number;
}

/** Per-schema lists kept alongside the schema node to synthesise folder children. */
interface SchemaLists {
  relations: RelationNode[];
  routines: FunctionNode[];
  sequences: DetailedNode[];
  types: DetailedNode[];
}

type Emit = (event: CatalogInvalidatedEvent) => void;

const RELKIND_TO_KIND: Record<string, RelationKind> = {
  r: 'table',
  p: 'partitionedTable',
  v: 'view',
  m: 'matview',
  f: 'foreignTable'
};

const GROUP_KINDS = ['tablesGroup', 'viewsGroup', 'functionsGroup', 'sequencesGroup', 'typesGroup'] as const;
const REL_GROUP_KINDS = ['columnsGroup', 'indexesGroup', 'constraintsGroup', 'triggersGroup'] as const;

function cacheKey(connectionId: string, database: string): string {
  return `${connectionId}/${database}`;
}

/**
 * Lazily loads catalog nodes with one parameterised query family per node kind and caches them
 * per (connection, database). Folder nodes are synthesised from their parent's cached lists.
 */
export class CatalogService {
  private readonly cache = new Map<string, Map<string, CacheEntry>>();
  private readonly schemaLists = new Map<string, Map<string, SchemaLists>>();
  private readonly indexes = new Map<string, CompletionIndex>();
  private readonly inflight = new Map<string, Promise<CatalogNode>>();

  constructor(
    private readonly pools: PoolProvider,
    private readonly emit: Emit = defaultEmit
  ) {}

  async getNode(opts: GetNodeOptions): Promise<CatalogNode> {
    const key = cacheKey(opts.connectionId, opts.database);
    const bucket = this.bucket(key);
    if (!opts.refresh) {
      const hit = bucket.get(opts.nodeId);
      if (hit) return hit.node;
      const pending = this.inflight.get(`${key}#${opts.nodeId}`);
      if (pending) return pending;
    } else {
      this.invalidateLocal(key, opts.nodeId);
    }
    const p = this.load(opts, key).finally(() => this.inflight.delete(`${key}#${opts.nodeId}`));
    this.inflight.set(`${key}#${opts.nodeId}`, p);
    return p;
  }

  async getCompletionIndex(opts: {
    connectionId: string;
    database: string;
    refresh?: boolean;
    showInternal?: boolean;
  }): Promise<CompletionIndex> {
    const key = cacheKey(opts.connectionId, opts.database);
    const hit = this.indexes.get(key);
    if (hit && !opts.refresh) return hit;
    const pool = await this.pools.getPool(opts.connectionId, opts.database);
    const index = await buildCompletionIndex(pool, { showInternal: opts.showInternal ?? false });
    this.indexes.set(key, index);
    return index;
  }

  /** Drop cached nodes for a connection, a database, or a node subtree, and notify the renderer. */
  invalidate(connectionId: string, database?: string, nodeIdPrefix?: string): void {
    if (database === undefined) {
      const dbs = new Set<string>();
      for (const key of [...this.cache.keys(), ...this.indexes.keys()]) {
        if (key.startsWith(`${connectionId}/`)) {
          dbs.add(key.slice(connectionId.length + 1));
          this.cache.delete(key);
          this.schemaLists.delete(key);
          this.indexes.delete(key);
        }
      }
      for (const db of dbs) this.emit({ connectionId, database: db });
      return;
    }
    const key = cacheKey(connectionId, database);
    if (nodeIdPrefix === undefined) {
      this.cache.delete(key);
      this.schemaLists.delete(key);
      this.indexes.delete(key);
    } else {
      this.invalidateLocal(key, nodeIdPrefix);
      this.indexes.delete(key);
    }
    this.emit(nodeIdPrefix === undefined ? { connectionId, database } : { connectionId, database, nodeId: nodeIdPrefix });
  }

  /* ------------------------------------------------------------------ */

  private bucket(key: string): Map<string, CacheEntry> {
    let b = this.cache.get(key);
    if (!b) {
      b = new Map();
      this.cache.set(key, b);
    }
    return b;
  }

  private lists(key: string): Map<string, SchemaLists> {
    let m = this.schemaLists.get(key);
    if (!m) {
      m = new Map();
      this.schemaLists.set(key, m);
    }
    return m;
  }

  private invalidateLocal(key: string, prefix: string): void {
    const b = this.cache.get(key);
    if (b) for (const id of [...b.keys()]) if (nodeIdMatches(prefix, id)) b.delete(id);
    const { kind, path } = decodeNodeId(prefix);
    const lists = this.schemaLists.get(key);
    if (!lists) return;
    if (kind === 'database') lists.clear();
    else if (path[1] !== undefined && (kind === 'schema' || (GROUP_KINDS as readonly string[]).includes(kind)))
      lists.delete(path[1]);
  }

  private store(key: string, node: CatalogNode): CatalogNode {
    const stamped = { ...node, loadedAt: Date.now() } as CatalogNode;
    this.bucket(key).set(node.id, { node: stamped, loadedAt: stamped.loadedAt ?? Date.now() });
    return stamped;
  }

  private async load(opts: GetNodeOptions, key: string): Promise<CatalogNode> {
    const { kind, path } = decodeNodeId(opts.nodeId);
    const db = path[0];
    if (db === undefined || db !== opts.database) throw new Error(`node ${opts.nodeId} does not belong to database ${opts.database}`);
    const pool = await this.pools.getPool(opts.connectionId, opts.database);

    switch (kind) {
      case 'connection':
        throw new Error('connection nodes are renderer-side only');
      case 'database':
        return this.store(key, await this.loadDatabase(pool, db, opts.showInternal ?? false));
      case 'schema':
        return this.store(key, await this.loadSchema(pool, key, db, need(path[1])));
      case 'tablesGroup':
      case 'viewsGroup':
      case 'functionsGroup':
      case 'sequencesGroup':
      case 'typesGroup':
        return this.store(key, await this.groupNode(pool, key, opts, kind, db, need(path[1])));
      case 'extension':
        return this.leafFromParent(key, opts);
      case 'table':
      case 'view':
      case 'matview':
      case 'foreignTable':
      case 'partitionedTable':
        return this.store(key, await this.loadRelation(pool, db, need(path[1]), need(path[2]), kind));
      case 'function':
      case 'procedure':
        return this.store(key, await this.loadRoutine(pool, db, need(path[1]), need(path[2]), path[3] ?? '', kind));
      case 'sequence':
      case 'type':
        return this.leafFromParent(key, opts);
      case 'columnsGroup':
      case 'indexesGroup':
      case 'constraintsGroup':
      case 'triggersGroup':
        return this.store(key, await this.relGroupNode(opts, kind, db, need(path[1]), need(path[2]), need(path[3])));
      case 'column':
      case 'index':
      case 'constraint':
      case 'trigger':
        return this.leafFromParent(key, opts);
    }
  }

  /** Leaves are cheap: they are already part of their parent's `children`. */
  private async leafFromParent(key: string, opts: GetNodeOptions): Promise<CatalogNode> {
    const parentId = parentNodeId(opts.nodeId);
    if (!parentId) throw new Error(`no parent for ${opts.nodeId}`);
    const parent = await this.getNode({ ...opts, nodeId: parentId, refresh: false });
    const child = parent.children?.find((c) => c.id === opts.nodeId);
    if (!child) throw new Error(`node not found: ${opts.nodeId}`);
    return this.store(key, child);
  }

  private async loadDatabase(pool: Queryable, db: string, showInternal: boolean): Promise<DatabaseNode> {
    const id = nodeIds.database(db);
    const schemas = schemasSql(showInternal);
    const [schemaRows, extRows, infoRows] = await Promise.all([
      pool.query<{ name: string; owner: string; comment: string | null }>(schemas.text, schemas.values),
      pool.query<{ name: string; version: string; schema: string }>(extensionsSql().text, extensionsSql().values),
      pool.query<{
        version: string;
        version_num: number;
        server_encoding: string;
        is_superuser: boolean;
        search_path: string;
        current_user: string;
      }>(serverInfoSql().text, serverInfoSql().values)
    ]);
    const info = infoRows.rows[0];
    if (!info) throw new Error('server info query returned no row');
    const server: ServerInfo = {
      version: info.version,
      versionNum: info.version_num,
      serverEncoding: info.server_encoding,
      isSuperuser: info.is_superuser,
      extensions: extRows.rows.map((e) => e.name)
    };
    const schemaNodes: SchemaNode[] = schemaRows.rows.map((r) => ({
      id: nodeIds.schema(db, r.name),
      kind: 'schema',
      name: r.name,
      parentId: id,
      hasChildren: true,
      owner: r.owner,
      comment: r.comment
    }));
    const extensionNodes: DetailedNode[] = extRows.rows.map((e) => ({
      id: nodeIds.extension(db, e.name),
      kind: 'extension',
      name: e.name,
      parentId: id,
      hasChildren: false,
      detail: { version: e.version, schema: e.schema }
    }));
    return {
      id,
      kind: 'database',
      name: db,
      parentId: null,
      hasChildren: true,
      schemas: schemaNodes,
      searchPath: parseSearchPath(info.search_path, info.current_user),
      server,
      children: [...schemaNodes, ...extensionNodes]
    };
  }

  private async loadSchema(pool: Queryable, key: string, db: string, schema: string): Promise<SchemaNode> {
    const id = nodeIds.schema(db, schema);
    const rels = relationsSql(schema);
    const routines = routinesSql(schema);
    const seqs = sequencesSql(schema);
    const types = typesSql(schema);
    const [relRows, routineRows, seqRows, typeRows, tsRows] = await Promise.all([
      pool.query<{ name: string; relkind: string; estimated_rows: string; size_bytes: string | null; comment: string | null }>(rels.text, rels.values),
      pool.query<{ name: string; prokind: string; args: string; identity_args: string; returns: string; language: string }>(routines.text, routines.values),
      pool.query<{ name: string; start_value: string; increment: string; cycle: boolean; data_type: string }>(seqs.text, seqs.values),
      pool.query<{ name: string; category: string; labels: string[] | null; base_type: string | null }>(types.text, types.values),
      pool.query<{ installed: boolean }>(hasTimescaleSql().text, hasTimescaleSql().values)
    ]);
    let hypertables = new Set<string>();
    if (tsRows.rows[0]?.installed) {
      const h = hypertablesSql(schema);
      try {
        const rows = await pool.query<{ name: string }>(h.text, h.values);
        hypertables = new Set(rows.rows.map((r) => r.name));
      } catch {
        /* timescaledb_information may be unreadable; not fatal */
      }
    }
    const relations: RelationNode[] = relRows.rows.map((r) => {
      const kind = RELKIND_TO_KIND[r.relkind] ?? 'table';
      return {
        id: nodeIds.relation(kind, db, schema, r.name),
        kind,
        name: r.name,
        parentId: nodeIds.group(kind === 'view' || kind === 'matview' ? 'viewsGroup' : 'tablesGroup', db, schema),
        hasChildren: true,
        schema,
        estimatedRows: r.estimated_rows,
        sizeBytes: r.size_bytes,
        comment: r.comment,
        ...(hypertables.has(r.name) ? { isHypertable: true } : {})
      };
    });
    const routineNodes: FunctionNode[] = routineRows.rows.map((r) => {
      const kind = r.prokind === 'p' ? 'procedure' : 'function';
      return {
        id: nodeIds.routine(kind, db, schema, r.name, r.identity_args),
        kind,
        name: r.name,
        parentId: nodeIds.group('functionsGroup', db, schema),
        hasChildren: false,
        schema,
        args: r.args,
        returns: r.returns,
        language: r.language
      };
    });
    const sequenceNodes: DetailedNode[] = seqRows.rows.map((r) => ({
      id: nodeIds.sequence(db, schema, r.name),
      kind: 'sequence',
      name: r.name,
      parentId: nodeIds.group('sequencesGroup', db, schema),
      hasChildren: false,
      detail: { startValue: r.start_value, increment: r.increment, cycle: r.cycle, dataType: r.data_type }
    }));
    const typeNodes: DetailedNode[] = typeRows.rows.map((r) => ({
      id: nodeIds.type(db, schema, r.name),
      kind: 'type',
      name: r.name,
      parentId: nodeIds.group('typesGroup', db, schema),
      hasChildren: false,
      detail: { category: r.category, labels: r.labels, baseType: r.base_type }
    }));
    this.lists(key).set(schema, { relations, routines: routineNodes, sequences: sequenceNodes, types: typeNodes });

    const tables = relations.filter((r) => r.kind !== 'view' && r.kind !== 'matview');
    const views = relations.filter((r) => r.kind === 'view' || r.kind === 'matview');
    const folder = (kind: (typeof GROUP_KINDS)[number], name: string, count: number): CatalogNodeBase => ({
      id: nodeIds.group(kind, db, schema),
      kind,
      name,
      parentId: id,
      hasChildren: count > 0,
      count
    });
    const owner = this.bucket(key).get(nodeIds.database(db))?.node as DatabaseNode | undefined;
    const ownerSchema = owner?.schemas.find((s) => s.name === schema);
    return {
      id,
      kind: 'schema',
      name: schema,
      parentId: nodeIds.database(db),
      hasChildren: true,
      owner: ownerSchema?.owner ?? '',
      comment: ownerSchema?.comment ?? null,
      children: [
        folder('tablesGroup', 'Tables', tables.length),
        folder('viewsGroup', 'Views', views.length),
        folder('functionsGroup', 'Functions', routineNodes.length),
        folder('sequencesGroup', 'Sequences', sequenceNodes.length),
        folder('typesGroup', 'Types', typeNodes.length)
      ]
    };
  }

  private async ensureSchemaLists(pool: Queryable, key: string, opts: GetNodeOptions, db: string, schema: string): Promise<SchemaLists> {
    const cached = this.lists(key).get(schema);
    if (cached) return cached;
    await this.getNode({ ...opts, nodeId: nodeIds.schema(db, schema), refresh: false });
    const after = this.lists(key).get(schema);
    if (!after) throw new Error(`schema ${schema} not found in ${db}`);
    void pool;
    return after;
  }

  private async groupNode(
    pool: Queryable,
    key: string,
    opts: GetNodeOptions,
    kind: (typeof GROUP_KINDS)[number],
    db: string,
    schema: string
  ): Promise<CatalogNodeBase> {
    const lists = await this.ensureSchemaLists(pool, key, opts, db, schema);
    const children: CatalogNodeBase[] =
      kind === 'tablesGroup'
        ? lists.relations.filter((r) => r.kind !== 'view' && r.kind !== 'matview')
        : kind === 'viewsGroup'
          ? lists.relations.filter((r) => r.kind === 'view' || r.kind === 'matview')
          : kind === 'functionsGroup'
            ? lists.routines
            : kind === 'sequencesGroup'
              ? lists.sequences
              : lists.types;
    const names: Record<(typeof GROUP_KINDS)[number], string> = {
      tablesGroup: 'Tables',
      viewsGroup: 'Views',
      functionsGroup: 'Functions',
      sequencesGroup: 'Sequences',
      typesGroup: 'Types'
    };
    return {
      id: nodeIds.group(kind, db, schema),
      kind,
      name: names[kind],
      parentId: nodeIds.schema(db, schema),
      hasChildren: children.length > 0,
      count: children.length,
      children
    };
  }

  /** TimescaleDB details when the extension is installed and the relation is a hypertable; null otherwise. Never throws. */
  private async loadHypertable(pool: Queryable, schema: string, name: string): Promise<HypertableInfo | null> {
    try {
      const ts = hasTimescaleSql();
      const installed = await pool.query<{ installed: boolean }>(ts.text, ts.values);
      if (!installed.rows[0]?.installed) return null;
      const q = hypertableInfoSql(schema, name);
      const r = await pool.query<{ chunks: number; compression_enabled: boolean; compressed_chunks: number; retention: string | null }>(q.text, q.values);
      const row = r.rows[0];
      if (!row) return null;
      const chunks = Number(row.chunks ?? 0);
      const compressedChunks = Number(row.compressed_chunks ?? 0);
      return {
        chunks,
        compressionEnabled: Boolean(row.compression_enabled),
        compressedChunks,
        compressionRatio: chunks > 0 ? compressedChunks / chunks : null,
        retention: row.retention ?? null
      };
    } catch {
      return null;
    }
  }

  private async loadRelation(pool: Queryable, db: string, schema: string, name: string, kindHint: RelationKind): Promise<RelationNode> {
    const rel = relationSql(schema, name);
    const relRows = await pool.query<{
      oid: string;
      name: string;
      relkind: string;
      estimated_rows: string;
      size_bytes: string | null;
      comment: string | null;
      view_definition: string | null;
    }>(rel.text, rel.values);
    const row = relRows.rows[0];
    if (!row) throw new Error(`relation ${schema}.${name} not found`);
    const kind = RELKIND_TO_KIND[row.relkind] ?? kindHint;
    const id = nodeIds.relation(kind, db, schema, name);
    const hypertable = await this.loadHypertable(pool, schema, name);

    const cols = columnsSql(schema, name);
    const cons = constraintsSql(schema, name);
    const idx = indexesSql(schema, name);
    const trg = triggersSql(schema, name);
    const [colRows, conRows, idxRows, trgRows] = await Promise.all([
      pool.query<{
        name: string; ordinal: number; data_type: string; nullable: boolean; default: string | null;
        generated: string; identity: string; comment: string | null; is_pk: boolean; is_fk: boolean; is_unique: boolean;
      }>(cols.text, cols.values),
      pool.query<{
        name: string; type: ConstraintInfo['type']; definition: string; columns: string[];
        ref_schema: string | null; ref_table: string | null; ref_columns: string[] | null; on_update: string | null; on_delete: string | null;
      }>(cons.text, cons.values),
      pool.query<{ name: string; definition: string; is_unique: boolean; is_primary: boolean; method: string; columns: string[]; size_bytes: string }>(idx.text, idx.values),
      pool.query<{ name: string; definition: string; tgtype: number; enabled: boolean }>(trg.text, trg.values)
    ]);

    const columns: ColumnInfo[] = colRows.rows.map((c) => ({
      name: c.name,
      ordinal: c.ordinal,
      dataType: c.data_type,
      nullable: c.nullable,
      default: c.generated === 's' ? null : c.default,
      generated: c.generated === 's' ? 'stored' : null,
      identity: c.identity === 'a' ? 'always' : c.identity === 'd' ? 'by default' : null,
      isPk: c.is_pk,
      isFk: c.is_fk,
      isUnique: c.is_unique,
      comment: c.comment
    }));
    const constraints: ConstraintInfo[] = conRows.rows.map((k) => ({
      name: k.name,
      type: k.type,
      definition: k.definition,
      columns: k.columns,
      ...(k.type === 'f'
        ? {
            refSchema: k.ref_schema ?? undefined,
            refTable: k.ref_table ?? undefined,
            refColumns: k.ref_columns ?? undefined,
            onUpdate: k.on_update ?? undefined,
            onDelete: k.on_delete ?? undefined
          }
        : {})
    }));
    const indexes: IndexInfo[] = idxRows.rows.map((i) => ({
      name: i.name,
      definition: i.definition,
      isUnique: i.is_unique,
      isPrimary: i.is_primary,
      method: i.method,
      columns: i.columns,
      sizeBytes: i.size_bytes
    }));
    const triggers: TriggerInfo[] = trgRows.rows.map((t) => {
      const { timing, events } = decodeTriggerType(t.tgtype);
      return { name: t.name, definition: t.definition, timing, events, enabled: t.enabled };
    });

    const groups: CatalogNodeBase[] = [];
    const group = (gk: (typeof REL_GROUP_KINDS)[number], label: string, items: DetailedNode[]): void => {
      groups.push({
        id: nodeIds.relGroup(gk, db, schema, kind, name),
        kind: gk,
        name: label,
        parentId: id,
        hasChildren: items.length > 0,
        count: items.length,
        children: items
      });
    };
    const leaf = (lk: 'column' | 'index' | 'constraint' | 'trigger', gk: (typeof REL_GROUP_KINDS)[number], n: string, detail: unknown): DetailedNode => ({
      id: nodeIds.relChild(lk, db, schema, kind, name, n),
      kind: lk,
      name: n,
      parentId: nodeIds.relGroup(gk, db, schema, kind, name),
      hasChildren: false,
      detail
    });
    group('columnsGroup', 'Columns', columns.map((c) => leaf('column', 'columnsGroup', c.name, c)));
    if (kind === 'table' || kind === 'partitionedTable' || kind === 'matview')
      group('indexesGroup', 'Indexes', indexes.map((i) => leaf('index', 'indexesGroup', i.name, i)));
    if (kind === 'table' || kind === 'partitionedTable' || kind === 'foreignTable')
      group('constraintsGroup', 'Constraints', constraints.map((k) => leaf('constraint', 'constraintsGroup', k.name, k)));
    if (kind === 'table' || kind === 'partitionedTable' || kind === 'view' || kind === 'foreignTable')
      group('triggersGroup', 'Triggers', triggers.map((t) => leaf('trigger', 'triggersGroup', t.name, t)));

    return {
      id,
      kind,
      name,
      parentId: nodeIds.group(kind === 'view' || kind === 'matview' ? 'viewsGroup' : 'tablesGroup', db, schema),
      hasChildren: true,
      schema,
      estimatedRows: row.estimated_rows,
      sizeBytes: row.size_bytes,
      comment: row.comment,
      columns,
      constraints,
      indexes,
      triggers,
      ...(row.view_definition ? { viewDefinition: row.view_definition } : {}),
      ...(hypertable ? { isHypertable: true, hypertable } : {}),
      children: groups
    };
  }

  private async relGroupNode(
    opts: GetNodeOptions,
    kind: (typeof REL_GROUP_KINDS)[number],
    db: string,
    schema: string,
    relKind: string,
    relName: string
  ): Promise<CatalogNodeBase> {
    if (!isRelationKind(relKind)) throw new Error(`invalid relation kind in ${opts.nodeId}`);
    const rel = await this.getNode({ ...opts, nodeId: nodeIds.relation(relKind, db, schema, relName), refresh: false });
    const found = rel.children?.find((c) => c.kind === kind);
    if (!found) throw new Error(`group ${kind} not available on ${relKind} ${schema}.${relName}`);
    return found;
  }

  private async loadRoutine(
    pool: Queryable,
    db: string,
    schema: string,
    name: string,
    identityArgs: string,
    kindHint: 'function' | 'procedure'
  ): Promise<FunctionNode> {
    const q = functionDefinitionSql(schema, name, identityArgs);
    const rows = await pool.query<{ name: string; prokind: string; args: string; returns: string; language: string; definition: string }>(q.text, q.values);
    const r = rows.rows[0];
    if (!r) throw new Error(`routine ${schema}.${name}(${identityArgs}) not found`);
    const kind = r.prokind === 'p' ? 'procedure' : kindHint === 'procedure' ? 'procedure' : 'function';
    return {
      id: nodeIds.routine(kind, db, schema, name, identityArgs),
      kind,
      name,
      parentId: nodeIds.group('functionsGroup', db, schema),
      hasChildren: false,
      schema,
      args: r.args,
      returns: r.returns,
      language: r.language,
      definition: r.definition
    };
  }
}

function need(v: string | undefined): string {
  if (v === undefined) throw new Error('malformed node id');
  return v;
}

function defaultEmit(e: CatalogInvalidatedEvent): void {
  try {
    push('catalog:invalidated', e);
  } catch {
    // no window / not running under electron (tests)
  }
}
