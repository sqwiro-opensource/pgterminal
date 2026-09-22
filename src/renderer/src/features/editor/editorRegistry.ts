/**
 * Module-level state shared between the single Monaco provider registration and the per-editor components:
 * which CompletionIndex belongs to which model, and hooks other features (doc links) plug into.
 */
import type { CompletionIndex } from '@shared/types/catalog';

const MODEL_SCHEME = 'inmemory';
const MODEL_AUTHORITY = 'pgui';

/** Stable URI for a model key; the completion provider maps a model back to its key through this. */
export function modelUriString(modelKey: string, ext: 'sql' | 'json'): string {
  return `${MODEL_SCHEME}://${MODEL_AUTHORITY}/${encodeURIComponent(modelKey)}.${ext}`;
}

export function modelKeyFromUri(uri: string): string | null {
  const m = /^inmemory:\/\/pgui\/(.+)\.(sql|json)$/.exec(uri);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

const indexes = new Map<string, CompletionIndex>();

/** Attach (or detach with `undefined`) the catalog completion index for an editor model. */
export function setEditorIndex(modelKey: string, index: CompletionIndex | undefined): void {
  if (index) indexes.set(modelKey, index);
  else indexes.delete(modelKey);
}

export function getEditorIndex(modelKey: string): CompletionIndex | undefined {
  return indexes.get(modelKey);
}

/** Where a model's values live, so link providers can build `pgui-doc://` urls with the right database. */
export interface EditorContext {
  connectionId: string;
  database: string;
  tabId?: string;
}

const contexts = new Map<string, EditorContext>();

export function setEditorContext(modelKey: string, ctx: EditorContext | undefined): void {
  if (ctx) contexts.set(modelKey, ctx);
  else contexts.delete(modelKey);
}

export function getEditorContext(modelKey: string): EditorContext | undefined {
  return contexts.get(modelKey);
}

/** Resolvability check used by the link providers; the doclink feature installs the catalog-aware one. */
export const linkResolver: { isResolvable(raw: string, connectionId: string, database: string): boolean } = {
  isResolvable: () => true
};

/** Hooks wired by other features (Phase 4 wires document links). */
export const editorHooks: {
  /** Called when the user activates a `pgui-doc://…` link inside any editor. */
  onOpenDocLink?: (url: string) => void;
} = {};
