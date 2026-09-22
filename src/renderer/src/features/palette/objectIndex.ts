import type { CatalogNode } from '@shared/types/catalog';
import { decodeNodeId } from '@shared/catalog/nodeId';
import { useStore } from '@renderer/store';
import { splitNodeKey, type NodeKey } from '@renderer/store/catalog.slice';

/**
 * Flat, searchable index of every database object the app knows about: relations from each open
 * database's completion index, plus anything already loaded into the catalog tree (functions,
 * sequences, types). Rebuilt at most every 5 minutes, or when a database is opened.
 */

export type ObjectKind = 'table' | 'view' | 'matview' | 'foreignTable' | 'partitionedTable' | 'function' | 'sequence' | 'type';

export interface ObjectEntry {
  /** Stable id: `${connectionId}/${database}/${schema}.${name}`. */
  id: string;
  kind: ObjectKind;
  schema: string;
  name: string;
  connectionId: string;
  connectionName: string;
  database: string;
  /** `schema.name`, precomputed for ranking and display. */
  qualified: string;
}

const RELATION_KINDS: Record<string, ObjectKind> = {
  r: 'table',
  table: 'table',
  v: 'view',
  view: 'view',
  m: 'matview',
  matview: 'matview',
  f: 'foreignTable',
  foreignTable: 'foreignTable',
  p: 'partitionedTable',
  partitionedTable: 'partitionedTable'
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; key: string; entries: ObjectEntry[] } | null = null;

/** Identity of the current open-database set; a change invalidates the cache immediately. */
function indexKey(): string {
  const s = useStore.getState();
  const parts: string[] = [];
  for (const [id, st] of Object.entries(s.status)) {
    if (st.state !== 'connected') continue;
    for (const db of st.openDatabases) parts.push(`${id}/${db}`);
  }
  parts.sort();
  return parts.join('|') + '#' + Object.keys(s.completionIndex).sort().join('|');
}

function fromCompletionIndex(entries: ObjectEntry[]): void {
  const s = useStore.getState();
  for (const [key, index] of Object.entries(s.completionIndex)) {
    const slash = key.indexOf('/');
    if (slash < 0) continue;
    const connectionId = key.slice(0, slash);
    const database = key.slice(slash + 1);
    const connectionName = s.connections[connectionId]?.name ?? connectionId;
    for (const rel of index.relations) {
      entries.push({
        id: `${connectionId}/${database}/${rel.schema}.${rel.name}`,
        kind: RELATION_KINDS[rel.kind] ?? 'table',
        schema: rel.schema,
        name: rel.name,
        connectionId,
        connectionName,
        database,
        qualified: `${rel.schema}.${rel.name}`
      });
    }
  }
}

const NODE_KINDS: Record<string, ObjectKind> = {
  function: 'function',
  procedure: 'function',
  sequence: 'sequence',
  type: 'type'
};

function fromCatalogNodes(entries: ObjectEntry[], seen: Set<string>): void {
  const s = useStore.getState();
  for (const [key, node] of Object.entries(s.nodes)) {
    const kind = NODE_KINDS[(node as CatalogNode).kind];
    if (!kind) continue;
    const { connectionId, nodeId } = splitNodeKey(key as NodeKey);
    let decoded: { path: string[] } | null = null;
    try {
      decoded = decodeNodeId(nodeId);
    } catch {
      continue;
    }
    const [database, schema] = decoded.path;
    const name = (node as CatalogNode).name;
    if (!database || !schema || !name) continue;
    const id = `${connectionId}/${database}/${schema}.${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      kind,
      schema,
      name,
      connectionId,
      connectionName: s.connections[connectionId]?.name ?? connectionId,
      database,
      qualified: `${schema}.${name}`
    });
  }
}

/** Builds (or returns the cached) object index. Cheap enough to call on every palette open. */
export function getObjectIndex(force = false): ObjectEntry[] {
  const key = indexKey();
  const now = Date.now();
  if (!force && cache && cache.key === key && now - cache.at < CACHE_TTL_MS) return cache.entries;

  const started = performance.now();
  const entries: ObjectEntry[] = [];
  fromCompletionIndex(entries);
  const seen = new Set(entries.map((e) => e.id));
  fromCatalogNodes(entries, seen);
  cache = { at: now, key, entries };
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`[palette] indexed ${entries.length} objects in ${(performance.now() - started).toFixed(1)} ms`);
  }
  return entries;
}

export function invalidateObjectIndex(): void {
  cache = null;
}

/** Asks main for the completion index of every open database so the palette can see them. */
export async function warmObjectIndex(): Promise<void> {
  const s = useStore.getState();
  const jobs: Array<Promise<unknown>> = [];
  for (const [connectionId, st] of Object.entries(s.status)) {
    if (st.state !== 'connected') continue;
    const databases = st.openDatabases.length > 0 ? st.openDatabases : [s.connections[connectionId]?.defaultDatabase].filter((d): d is string => Boolean(d));
    for (const db of databases) {
      if (s.completionIndex[`${connectionId}/${db}`]) continue;
      jobs.push(s.ensureCompletionIndex(connectionId, db).catch(() => undefined));
    }
  }
  if (jobs.length > 0) {
    await Promise.all(jobs);
    invalidateObjectIndex();
  }
}
