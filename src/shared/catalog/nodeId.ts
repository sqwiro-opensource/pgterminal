import type { NodeKind } from '../types/catalog';

/**
 * Catalog node ids are `/`-joined, URL-encoded segments: `<kind>/<path...>`.
 *
 *   database/<db>
 *   schema/<db>/<schema>
 *   tablesGroup|viewsGroup|functionsGroup|sequencesGroup|typesGroup/<db>/<schema>
 *   extension/<db>/<name>
 *   table|view|matview|foreignTable|partitionedTable/<db>/<schema>/<name>
 *   function|procedure/<db>/<schema>/<name>/<args>
 *   sequence|type/<db>/<schema>/<name>
 *   columnsGroup|indexesGroup|constraintsGroup|triggersGroup/<db>/<schema>/<relKind>/<relName>
 *   column|index|constraint|trigger/<db>/<schema>/<relKind>/<relName>/<name>
 *
 * Relation-scoped ids carry the relation kind so the parent id can be rebuilt without a lookup.
 */

export type RelationKind = 'table' | 'view' | 'matview' | 'foreignTable' | 'partitionedTable';

export const RELATION_KINDS: readonly RelationKind[] = ['table', 'view', 'matview', 'foreignTable', 'partitionedTable'];

const KINDS = new Set<string>([
  'connection', 'database', 'schema', 'tablesGroup', 'viewsGroup', 'functionsGroup', 'typesGroup',
  'sequencesGroup', 'table', 'view', 'matview', 'foreignTable', 'partitionedTable', 'columnsGroup',
  'column', 'indexesGroup', 'index', 'constraintsGroup', 'constraint', 'triggersGroup', 'trigger',
  'function', 'procedure', 'sequence', 'type', 'extension'
]);

export function isRelationKind(kind: string): kind is RelationKind {
  return (RELATION_KINDS as readonly string[]).includes(kind);
}

/** Build an id from a kind and raw (unencoded) path segments. */
export function encodeNodeId(kind: NodeKind, path: readonly string[]): string {
  return [kind, ...path.map((s) => encodeURIComponent(s))].join('/');
}

/** Split an id back into its kind and decoded path. Throws on malformed ids. */
export function decodeNodeId(id: string): { kind: NodeKind; path: string[] } {
  const [kind, ...rest] = id.split('/');
  if (!kind || !KINDS.has(kind)) throw new Error(`invalid node id: ${id}`);
  return { kind: kind as NodeKind, path: rest.map((s) => decodeURIComponent(s)) };
}

/** Parent id following the tree hierarchy, or null for a database node. */
export function parentNodeId(id: string): string | null {
  const { kind, path } = decodeNodeId(id);
  const [db, schema, a, b] = path;
  if (db === undefined) return null;
  switch (kind) {
    case 'connection':
    case 'database':
      return null;
    case 'schema':
    case 'extension':
      return encodeNodeId('database', [db]);
    case 'tablesGroup':
    case 'viewsGroup':
    case 'functionsGroup':
    case 'typesGroup':
    case 'sequencesGroup':
      return schema === undefined ? null : encodeNodeId('schema', [db, schema]);
    case 'table':
    case 'foreignTable':
    case 'partitionedTable':
      return schema === undefined ? null : encodeNodeId('tablesGroup', [db, schema]);
    case 'view':
    case 'matview':
      return schema === undefined ? null : encodeNodeId('viewsGroup', [db, schema]);
    case 'function':
    case 'procedure':
      return schema === undefined ? null : encodeNodeId('functionsGroup', [db, schema]);
    case 'sequence':
      return schema === undefined ? null : encodeNodeId('sequencesGroup', [db, schema]);
    case 'type':
      return schema === undefined ? null : encodeNodeId('typesGroup', [db, schema]);
    case 'columnsGroup':
    case 'indexesGroup':
    case 'constraintsGroup':
    case 'triggersGroup':
      return schema !== undefined && a !== undefined && b !== undefined && isRelationKind(a)
        ? encodeNodeId(a, [db, schema, b])
        : null;
    case 'column':
      return relChildParent('columnsGroup', db, schema, a, b);
    case 'index':
      return relChildParent('indexesGroup', db, schema, a, b);
    case 'constraint':
      return relChildParent('constraintsGroup', db, schema, a, b);
    case 'trigger':
      return relChildParent('triggersGroup', db, schema, a, b);
  }
}

function relChildParent(
  group: NodeKind,
  db: string,
  schema: string | undefined,
  relKind: string | undefined,
  relName: string | undefined
): string | null {
  return schema !== undefined && relKind !== undefined && relName !== undefined && isRelationKind(relKind)
    ? encodeNodeId(group, [db, schema, relKind, relName])
    : null;
}

/** True when `id` is `prefix` itself or lies underneath it (segment-wise). */
export function nodeIdMatches(prefix: string, id: string): boolean {
  return id === prefix || id.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');
}

/* ---- convenience builders ---- */

export const nodeIds = {
  database: (db: string) => encodeNodeId('database', [db]),
  schema: (db: string, schema: string) => encodeNodeId('schema', [db, schema]),
  group: (kind: 'tablesGroup' | 'viewsGroup' | 'functionsGroup' | 'typesGroup' | 'sequencesGroup', db: string, schema: string) =>
    encodeNodeId(kind, [db, schema]),
  extension: (db: string, name: string) => encodeNodeId('extension', [db, name]),
  relation: (kind: RelationKind, db: string, schema: string, name: string) => encodeNodeId(kind, [db, schema, name]),
  routine: (kind: 'function' | 'procedure', db: string, schema: string, name: string, args: string) =>
    encodeNodeId(kind, [db, schema, name, args]),
  sequence: (db: string, schema: string, name: string) => encodeNodeId('sequence', [db, schema, name]),
  type: (db: string, schema: string, name: string) => encodeNodeId('type', [db, schema, name]),
  relGroup: (
    kind: 'columnsGroup' | 'indexesGroup' | 'constraintsGroup' | 'triggersGroup',
    db: string,
    schema: string,
    relKind: RelationKind,
    relName: string
  ) => encodeNodeId(kind, [db, schema, relKind, relName]),
  relChild: (
    kind: 'column' | 'index' | 'constraint' | 'trigger',
    db: string,
    schema: string,
    relKind: RelationKind,
    relName: string,
    name: string
  ) => encodeNodeId(kind, [db, schema, relKind, relName, name])
};
