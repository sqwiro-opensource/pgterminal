/**
 * One implementation of document-link behaviour shared by the grid, JSON trees, the document tab, Monaco and
 * (later) the command palette. Pure parsing/ranking lives in `@shared/doclink`; this module adds the renderer
 * side: caches, IPC resolution and navigation. Usable outside React (`docLinks`) and via `useDocLinks()`.
 */
import { parseDocRef, rankCandidates } from '@shared/doclink';
import type { DocLinkResolution, DocRef, DocTarget } from '@shared/types/doclink';
import type { Filter } from '@shared/types/rows';
import { toast } from 'sonner';
import { pgui } from '@renderer/lib/ipc';
import { setLinkDetector } from '@renderer/lib/format';
import { useStore } from '@renderer/store';
import { parseDocLinkUrl } from '@renderer/features/editor/docLinkUrl';
import { editorHooks, linkResolver } from '@renderer/features/editor/editorRegistry';
import { pickCandidate } from './AmbiguityPicker';

export interface LinkContext {
  connectionId: string;
  database: string;
  /** Tab the click came from; a document tab navigates in place. */
  fromTabId?: string;
}

export interface OpenOptions extends LinkContext {
  preferred?: { schema: string; table: string };
  /** Open a new tab even from a document tab; the new tab is not focused. */
  newTab?: boolean;
  /** Peek in the inspector instead of opening a tab. */
  peek?: boolean;
}

const NEGATIVE_TTL_MS = 30_000;
const PARSE_MEMO_CAP = 5_000;

const parseMemo = new Map<string, DocRef | null>();
const found = new Map<string, Extract<DocLinkResolution, { status: 'found' }>>();
const negative = new Map<string, { res: DocLinkResolution; at: number }>();
const inflight = new Map<string, Promise<DocLinkResolution>>();
/** Ambiguity choices remembered for the session, keyed by `${conn}/${db}/${table}`. */
const chosen = new Map<string, { schema: string; table: string }>();

function memoKey(ctx: LinkContext, raw: string, preferred?: { schema: string; table: string }): string {
  return `${ctx.connectionId}/${ctx.database}/${raw}/${preferred ? `${preferred.schema}.${preferred.table}` : ''}`;
}

function isRef(value: unknown): DocRef | null {
  if (typeof value !== 'string') return null;
  const hit = parseMemo.get(value);
  if (hit !== undefined) return hit;
  const ref = parseDocRef(value);
  if (parseMemo.size >= PARSE_MEMO_CAP) parseMemo.clear();
  parseMemo.set(value, ref);
  return ref;
}

/** Candidate targets against the cached completion index; triggers the index load when missing. */
function candidates(ref: DocRef, connectionId: string, database: string): DocTarget[] {
  const index = useStore.getState().completionIndex[`${connectionId}/${database}`];
  if (!index) {
    void useStore.getState().ensureCompletionIndex(connectionId, database);
    return [];
  }
  return rankCandidates(ref, index);
}

/** True when the value is a ref that maps to at least one relation of this database. */
function isResolvable(value: unknown, connectionId: string, database: string): boolean {
  const ref = isRef(value);
  if (!ref) return false;
  if (candidates(ref, connectionId, database).length > 0) return true;
  return useStore.getState().settings.linkUnresolved;
}

async function resolve(
  ref: DocRef,
  ctx: LinkContext,
  preferred?: { schema: string; table: string }
): Promise<DocLinkResolution> {
  const key = memoKey(ctx, ref.raw, preferred);
  const hit = found.get(key);
  if (hit) return hit;
  const neg = negative.get(key);
  if (neg && Date.now() - neg.at < NEGATIVE_TTL_MS) return neg.res;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const res = await pgui['doclink:resolve']({
        connectionId: ctx.connectionId,
        database: ctx.database,
        ref,
        ...(preferred ? { preferred } : {})
      });
      if (res.status === 'found') found.set(key, res);
      else negative.set(key, { res, at: Date.now() });
      return res;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Drop cached resolutions for one database (or everything). Called on catalog invalidation and after writes. */
function clearCache(connectionId?: string, database?: string): void {
  const prefix = connectionId ? `${connectionId}/${database ?? ''}` : '';
  for (const m of [found, negative, inflight]) {
    for (const k of Array.from(m.keys())) if (k.startsWith(prefix)) m.delete(k);
  }
}

function tableDataFilter(target: DocTarget): Filter[] {
  return [{ column: target.keyColumn, op: 'eq', value: target.keyValue }];
}

function openDocumentTab(target: DocTarget, opts: OpenOptions): void {
  const { openTab, updateParams, setTitle, tabs } = useStore.getState();
  const from = opts.fromTabId ? tabs.find((t) => t.id === opts.fromTabId) : undefined;
  if (from && from.kind === 'document' && !opts.newTab) {
    const p = from.params as { history: DocTarget[]; index: number };
    const history = [...p.history.slice(0, p.index + 1), target];
    updateParams<'document'>(from.id, { history, index: history.length - 1 });
    setTitle(from.id, `${target.table}/${target.keyValue}`);
    return;
  }
  openTab(
    'document',
    { connectionId: opts.connectionId, database: opts.database, history: [target], index: 0, view: 'tree' },
    { reuse: !opts.newTab, focus: !opts.newTab }
  );
}

function peekDocument(target: DocTarget, opts: OpenOptions): void {
  const s = useStore.getState();
  s.setInspectorVisible(true);
  s.setTabRuntime('inspector', { kind: 'doc', target, connectionId: opts.connectionId, database: opts.database });
}

/** Resolve a ref and navigate: in-place for document tabs, otherwise a (reused) document tab. */
async function open(ref: DocRef, opts: OpenOptions): Promise<DocTarget | null> {
  const remembered = chosen.get(`${opts.connectionId}/${opts.database}/${ref.table}`);
  let preferred = opts.preferred ?? remembered;
  let res = await resolve(ref, opts, preferred);
  if (res.status === 'ambiguous') {
    const pick = await pickCandidate(res.candidates, ref);
    if (!pick) return null;
    preferred = { schema: pick.schema, table: pick.table };
    chosen.set(`${opts.connectionId}/${opts.database}/${ref.table}`, preferred);
    res = await resolve(ref, opts, preferred);
  }
  if (res.status === 'found') {
    if (opts.peek) peekDocument(res.target, opts);
    else openDocumentTab(res.target, opts);
    return res.target;
  }
  if (res.status === 'notFound') {
    const tried = res.candidates.map((c) => `${c.schema}.${c.table}`).join(', ');
    toast.error(`No row for ${ref.raw}`, { description: tried ? `Looked in ${tried}` : 'No matching table in this database' });
  } else if (res.status === 'ambiguous') {
    toast.error(`${ref.raw} is ambiguous`);
  }
  return null;
}

/** Open the referencing table filtered to this document. */
async function openInTable(ref: DocRef, opts: OpenOptions): Promise<void> {
  const res = await resolve(ref, opts, opts.preferred);
  if (res.status !== 'found') {
    toast.error(`Cannot locate ${ref.raw}`);
    return;
  }
  const t = res.target;
  useStore.getState().openTab('table-data', {
    connectionId: opts.connectionId,
    database: opts.database,
    schema: t.schema,
    table: t.table,
    filters: tableDataFilter(t),
    sort: [],
    page: { mode: 'keyset', after: null }
  });
}

function targetSql(target: DocTarget): string {
  const q = (s: string): string => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
  return `SELECT * FROM ${q(target.schema)}.${q(target.table)} WHERE ${q(target.keyColumn)}::text = '${target.keyValue.replace(/'/g, "''")}';`;
}

/** Parse a `pgui-doc://<raw>?conn=…&db=…&tab=…` link produced by the Monaco link providers. */
function openFromUrl(url: string): void {
  const payload = parseDocLinkUrl(url);
  if (!payload) return;
  const ref = isRef(payload.raw);
  if (!ref) return;
  // The click happened inside the active tab, so that is the tab to navigate in place.
  const fromTabId = useStore.getState().activeTabId ?? undefined;
  void open(ref, {
    connectionId: payload.connectionId,
    database: payload.database,
    ...(fromTabId ? { fromTabId } : {})
  });
}

export const docLinks = {
  isRef,
  candidates,
  isResolvable,
  resolve,
  open,
  openInTable,
  targetSql,
  tableDataFilter,
  clearCache,
  openFromUrl
};

export type DocLinks = typeof docLinks;

// Exposed for the same reason as the store: it lets an automated run drive the real link
// pipeline. Harmless in production — the renderer is sandboxed and has no Node access.
declare global {
  interface Window {
    __pguiDocLinks?: typeof docLinks;
  }
}
if (typeof window !== 'undefined') window.__pguiDocLinks = docLinks;

// ---- wiring at module init ------------------------------------------------------------------------------
setLinkDetector((v) => isRef(v) !== null);
editorHooks.onOpenDocLink = openFromUrl;
linkResolver.isResolvable = isResolvable;

// Cached resolutions become stale when the catalog (or the completion index) changes.
let lastIndex = useStore.getState().completionIndex;
useStore.subscribe((s) => {
  if (s.completionIndex === lastIndex) return;
  for (const k of Object.keys(lastIndex)) {
    if (!(k in s.completionIndex)) {
      const [conn, db] = k.split('/');
      if (conn) clearCache(conn, db);
    }
  }
  lastIndex = s.completionIndex;
});
