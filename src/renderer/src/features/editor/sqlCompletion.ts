/**
 * Pure completion builder: turns an SqlContext + CompletionIndex into plain items. The Monaco mapping lives in
 * monacoSetup.ts so this module stays testable without a DOM.
 */
import type { CompletionIndex } from '@shared/types/catalog';
import { quoteIdent } from '@shared/sql/quote';
import { POSTGRES_FUNCTIONS, POSTGRES_KEYWORDS, POSTGRES_SNIPPETS, POSTGRES_TYPES } from './completionData';
import type { SqlContext, TableRef } from './sqlContext';

export type CompletionKind = 'schema' | 'table' | 'view' | 'column' | 'keyword' | 'function' | 'snippet' | 'type';

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  insertText: string;
  detail?: string;
  documentation?: string;
  /** Lower sorts first. */
  sortText: string;
  isSnippet?: boolean;
}

type Relation = CompletionIndex['relations'][number];

const VIEW_KINDS = new Set(['view', 'matview', 'v', 'm']);
const EMPTY_INDEX: CompletionIndex = { searchPath: [], relations: [], builtAt: 0 };

/**
 * Resolve a bare or qualified table name: explicit schema → search_path order → `schema_table` prefix rule
 * (`sales_customer` → schema `sales`) → unique match anywhere.
 */
export function resolveRelation(index: CompletionIndex, table: string, schema?: string): Relation | null {
  const rels = index.relations;
  if (schema) return rels.find((r) => r.schema === schema && r.name === table) ?? null;
  for (const s of index.searchPath) {
    const hit = rels.find((r) => r.schema === s && r.name === table);
    if (hit) return hit;
  }
  const schemas = Array.from(new Set(rels.map((r) => r.schema))).sort((a, b) => b.length - a.length);
  for (const s of schemas) {
    if (table.startsWith(s + '_')) {
      const hit = rels.find((r) => r.schema === s && r.name === table);
      if (hit) return hit;
    }
  }
  const any = rels.filter((r) => r.name === table);
  return any.length === 1 ? (any[0] ?? null) : null;
}

const resolveRef = (index: CompletionIndex, ref: TableRef): Relation | null =>
  resolveRelation(index, ref.table, ref.schema);

const ident = (name: string): string => quoteIdent(name);

function columnItems(rel: Relation, qualifierForInsert: string | undefined, detailPrefix: string): CompletionItem[] {
  return rel.columns.map((c) => ({
    label: c.name,
    kind: 'column',
    insertText: qualifierForInsert ? `${qualifierForInsert}.${ident(c.name)}` : ident(c.name),
    detail: `${c.type}${c.isPk ? ' (pk)' : ''} · ${detailPrefix}`,
    sortText: `${c.isPk ? '0' : '1'}${c.name}`
  }));
}

function schemaItems(index: CompletionIndex): CompletionItem[] {
  const schemas = Array.from(new Set(index.relations.map((r) => r.schema))).sort();
  return schemas.map((s) => ({ label: s, kind: 'schema', insertText: ident(s), detail: 'schema', sortText: `4${s}` }));
}

function tableItems(index: CompletionIndex, onlySchema?: string): CompletionItem[] {
  const out: CompletionItem[] = [];
  const onPath = new Set(index.searchPath);
  for (const r of index.relations) {
    if (onlySchema && r.schema !== onlySchema) continue;
    const kind: CompletionKind = VIEW_KINDS.has(r.kind) ? 'view' : 'table';
    if (onlySchema) {
      out.push({ label: r.name, kind, insertText: ident(r.name), detail: `${r.kind} · ${r.schema}`, sortText: `2${r.name}` });
      continue;
    }
    if (onPath.has(r.schema)) {
      out.push({ label: r.name, kind, insertText: ident(r.name), detail: `${r.kind} · ${r.schema}`, sortText: `2${r.name}` });
    }
    out.push({
      label: `${r.schema}.${r.name}`,
      kind,
      insertText: `${ident(r.schema)}.${ident(r.name)}`,
      detail: r.kind,
      sortText: `3${r.schema}.${r.name}`
    });
  }
  return out;
}

const keywordItems = (): CompletionItem[] =>
  POSTGRES_KEYWORDS.map((k) => ({ label: k, kind: 'keyword', insertText: k, sortText: `5${k}` }));

function functionItems(): CompletionItem[] {
  return POSTGRES_FUNCTIONS.map((f) => {
    const item: CompletionItem = {
      label: f.label,
      kind: 'function',
      insertText: f.insertText,
      detail: f.detail,
      sortText: `6${f.label}`,
      isSnippet: true
    };
    if (f.documentation) item.documentation = f.documentation;
    return item;
  });
}

const BUILTIN_SNIPPETS: Array<Omit<CompletionItem, 'kind' | 'isSnippet'>> = [
  { label: 'SELECT … FROM … WHERE', insertText: 'SELECT * FROM ${1:table} WHERE ${2:condition};', detail: 'Query template', sortText: '70select' },
  { label: 'INSERT INTO', insertText: 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values});', detail: 'Insert template', sortText: '71insert' },
  { label: 'UPDATE … SET', insertText: 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition};', detail: 'Update template', sortText: '72update' },
  { label: 'DELETE FROM', insertText: 'DELETE FROM ${1:table} WHERE ${2:condition};', detail: 'Delete template', sortText: '73delete' },
  { label: 'WITH … AS', insertText: 'WITH ${1:cte} AS (\n  ${2:SELECT 1}\n)\nSELECT * FROM ${1:cte};', detail: 'CTE template', sortText: '74with' },
  { label: 'EXPLAIN ANALYZE', insertText: 'EXPLAIN (ANALYZE, BUFFERS) ${1:SELECT 1};', detail: 'Plan with timing', sortText: '75explain' }
];

function snippetItems(): CompletionItem[] {
  const builtin = BUILTIN_SNIPPETS.map((s): CompletionItem => ({ ...s, kind: 'snippet', isSnippet: true }));
  const ported = POSTGRES_SNIPPETS.map((s) => {
    const item: CompletionItem = {
      label: s.label,
      kind: 'snippet',
      insertText: s.insertText,
      detail: s.detail,
      sortText: `78${s.label}`,
      isSnippet: true
    };
    if (s.documentation) item.documentation = s.documentation;
    return item;
  });
  return [...builtin, ...ported];
}

const typeItems = (): CompletionItem[] =>
  POSTGRES_TYPES.map((t) => ({ label: t, kind: 'type', insertText: t, detail: 'type', sortText: `8${t}` }));

/** Build completion items for the given context. Prefix filtering is left to the editor. */
export function buildCompletions(ctx: SqlContext, index: CompletionIndex | undefined): CompletionItem[] {
  const idx = index ?? EMPTY_INDEX;
  switch (ctx.kind) {
    case 'none':
      return [];
    case 'afterFrom':
      return [...tableItems(idx), ...schemaItems(idx)];
    case 'afterDot': {
      const q = ctx.qualifier ?? '';
      const aliasTarget = ctx.aliases[q];
      if (aliasTarget) {
        const rel = resolveRelation(idx, aliasTarget.table, aliasTarget.schema);
        if (rel) return columnItems(rel, undefined, `${rel.schema}.${rel.name}`);
      }
      if (idx.relations.some((r) => r.schema === q)) return tableItems(idx, q);
      const rel = resolveRelation(idx, q);
      return rel ? columnItems(rel, undefined, `${rel.schema}.${rel.name}`) : [];
    }
    case 'column': {
      const out: CompletionItem[] = [];
      const multi = ctx.tablesInScope.length >= 2;
      for (const ref of ctx.tablesInScope) {
        const rel = resolveRef(idx, ref);
        if (!rel) continue;
        const q = multi ? ident(ref.alias ?? ref.table) : undefined;
        out.push(...columnItems(rel, q, `${ref.alias ? ref.alias + ' → ' : ''}${rel.schema}.${rel.name}`));
      }
      return [...out, ...keywordItems(), ...functionItems()];
    }
    case 'keyword':
    default:
      return [...keywordItems(), ...functionItems(), ...snippetItems(), ...typeItems()];
  }
}

/** Type description of `qualifier.name` or bare `name` among the tables in scope; used by hover. */
export function lookupColumnType(
  ctx: SqlContext,
  index: CompletionIndex | undefined,
  name: string,
  qualifier?: string
): string | null {
  if (!index) return null;
  const refs = qualifier
    ? ctx.tablesInScope.filter((r) => (r.alias ?? r.table) === qualifier || r.table === qualifier)
    : ctx.tablesInScope;
  for (const ref of refs) {
    const rel = resolveRef(index, ref);
    const col = rel?.columns.find((c) => c.name === name);
    if (rel && col) return `${col.type}${col.isPk ? ' (primary key)' : ''} — ${rel.schema}.${rel.name}`;
  }
  return null;
}
