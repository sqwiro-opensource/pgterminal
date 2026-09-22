import type { ServerInfo } from './connection';

/** Every kind of node the sidebar tree can show. */
export type NodeKind =
  | 'connection'
  | 'database'
  | 'schema'
  | 'tablesGroup'
  | 'viewsGroup'
  | 'functionsGroup'
  | 'typesGroup'
  | 'sequencesGroup'
  | 'table'
  | 'view'
  | 'matview'
  | 'foreignTable'
  | 'partitionedTable'
  | 'columnsGroup'
  | 'column'
  | 'indexesGroup'
  | 'index'
  | 'constraintsGroup'
  | 'constraint'
  | 'triggersGroup'
  | 'trigger'
  | 'function'
  | 'procedure'
  | 'sequence'
  | 'type'
  | 'extension';

/** Fields shared by every catalog node. */
export interface CatalogNodeBase {
  /** Encoded by shared/catalog/nodeId.ts. */
  id: string;
  kind: NodeKind;
  name: string;
  parentId: string | null;
  hasChildren: boolean;
  loadedAt?: number;
  /** Number of children for folder nodes (shown as a suffix in the tree). */
  count?: number;
  /** Next level, when the server could return it cheaply with this node. */
  children?: CatalogNodeBase[];
}

/** Column of a relation. */
export interface ColumnInfo {
  name: string;
  ordinal: number;
  dataType: string;
  nullable: boolean;
  default: string | null;
  generated: 'stored' | null;
  identity: 'always' | 'by default' | null;
  isPk: boolean;
  isFk: boolean;
  isUnique: boolean;
  comment: string | null;
}

/** Constraint of a relation (contype letter as in pg_constraint). */
export interface ConstraintInfo {
  name: string;
  type: 'p' | 'f' | 'u' | 'c' | 'x';
  definition: string;
  columns: string[];
  refSchema?: string;
  refTable?: string;
  refColumns?: string[];
  onUpdate?: string;
  onDelete?: string;
}

/** Index of a relation. */
export interface IndexInfo {
  name: string;
  definition: string;
  isUnique: boolean;
  isPrimary: boolean;
  method: string;
  columns: string[];
  /** Bigint as string. */
  sizeBytes: string;
}

/** Trigger of a relation. */
export interface TriggerInfo {
  name: string;
  definition: string;
  timing: string;
  events: string[];
  enabled: boolean;
}

/** TimescaleDB facts about a hypertable. */
export interface HypertableInfo {
  chunks: number;
  compressionEnabled: boolean;
  compressedChunks: number;
  /** compressedChunks / chunks, null when there are no chunks. */
  compressionRatio: number | null;
  /** drop_after of the retention policy, e.g. "30 days"; null when none. */
  retention: string | null;
}

/** A table-like relation node, with details once loaded. */
export interface RelationNode extends CatalogNodeBase {
  kind: 'table' | 'view' | 'matview' | 'foreignTable' | 'partitionedTable';
  schema: string;
  /** reltuples as string. */
  estimatedRows: string;
  sizeBytes: string | null;
  comment: string | null;
  isHypertable?: boolean;
  /** TimescaleDB details, present on hypertables once the relation node is loaded. */
  hypertable?: HypertableInfo;
  columns?: ColumnInfo[];
  constraints?: ConstraintInfo[];
  indexes?: IndexInfo[];
  triggers?: TriggerInfo[];
  viewDefinition?: string;
}

/** Schema node; children are group nodes once loaded. */
export interface SchemaNode extends CatalogNodeBase {
  kind: 'schema';
  owner: string;
  comment: string | null;
  children?: CatalogNodeBase[];
}

/** Database node with its schemas and server facts. */
export interface DatabaseNode extends CatalogNodeBase {
  kind: 'database';
  schemas: SchemaNode[];
  searchPath: string[];
  server: ServerInfo;
}

/** Function or procedure node. */
export interface FunctionNode extends CatalogNodeBase {
  kind: 'function' | 'procedure';
  schema: string;
  args: string;
  returns: string;
  language: string;
  definition?: string;
}

/** Any node returned by catalog:getNode. */
export type CatalogNode = DatabaseNode | SchemaNode | RelationNode | FunctionNode | CatalogNodeBase;

/** Flat relation/column index per database for completion and link resolution. */
export interface CompletionIndex {
  searchPath: string[];
  relations: Array<{
    schema: string;
    name: string;
    kind: string;
    columns: Array<{ name: string; type: string; isPk: boolean }>;
  }>;
  builtAt: number;
}

/** Push payload on catalog:invalidated. */
export interface CatalogInvalidatedEvent {
  connectionId: string;
  database: string;
  nodeId?: string;
}

/** Request for ddl:get. */
export interface DdlRequest {
  connectionId: string;
  database: string;
  kind: 'table' | 'view' | 'matview' | 'index' | 'trigger' | 'column' | 'function' | 'schema' | 'constraint';
  schema?: string;
  name: string;
  parent?: string;
}
