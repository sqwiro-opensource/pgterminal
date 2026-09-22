import type { DocRef } from '../types/doclink';
import type { JsonValue } from '../types/query';
import { parseDocRef } from './parseDocRef';

export interface FoundDocRef {
  /** JSON-pointer-like path to the string leaf, e.g. `/meta/owner` or `/tags/1`; `` for the root. */
  path: string;
  ref: DocRef;
}

export interface FindDocRefsOptions {
  maxDepth?: number;
  maxRefs?: number;
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Walks a JSON value and returns every string leaf that parses as a document reference.
 * Object keys are never considered. Stops at `maxDepth` (default 32) and after `maxRefs` (default 500).
 */
export function findDocRefs(value: JsonValue | undefined, opts: FindDocRefsOptions = {}): FoundDocRef[] {
  const maxDepth = opts.maxDepth ?? 32;
  const maxRefs = opts.maxRefs ?? 500;
  const out: FoundDocRef[] = [];

  const walk = (v: JsonValue | undefined, path: string, depth: number): void => {
    if (out.length >= maxRefs || depth > maxDepth) return;
    if (typeof v === 'string') {
      const ref = parseDocRef(v);
      if (ref) out.push({ path, ref });
      return;
    }
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        walk(v[i], `${path}/${i}`, depth + 1);
        if (out.length >= maxRefs) return;
      }
      return;
    }
    for (const [k, child] of Object.entries(v)) {
      walk(child, `${path}/${escapePointer(k)}`, depth + 1);
      if (out.length >= maxRefs) return;
    }
  };

  walk(value, '', 0);
  return out;
}
