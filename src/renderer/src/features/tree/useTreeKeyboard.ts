import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import type { TreeRow } from './treeModel';

export interface TreeKeyboardHandlers {
  toggle(row: TreeRow, force?: boolean): void;
  primary(row: TreeRow): void;
  /** ⌘Enter / Ctrl+Enter (e.g. open structure). */
  secondary?(row: TreeRow): void;
  /** Delete / Backspace (drop, with confirmation). */
  remove?(row: TreeRow): void;
  /** F2. */
  rename?(row: TreeRow): void;
  scrollTo(index: number): void;
}

/** Roving focus + arrow/Enter/Space/Home/End/type-ahead navigation for the flattened tree. */
export function useTreeKeyboard(rows: TreeRow[], h: TreeKeyboardHandlers) {
  const [focusIndex, setFocusIndex] = useState(0);
  const typeahead = useRef<{ buffer: string; at: number }>({ buffer: '', at: 0 });

  const move = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(rows.length - 1, index));
      setFocusIndex(clamped);
      h.scrollTo(clamped);
    },
    [rows.length, h]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const row = rows[focusIndex];
      if (!row) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(focusIndex + 1);
          return;
        case 'ArrowUp':
          e.preventDefault();
          move(focusIndex - 1);
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (row.hasChildren && !row.expanded) h.toggle(row, true);
          else if (row.expanded) {
            const child = rows.findIndex((r, i) => i > focusIndex && r.parent === focusIndex);
            if (child >= 0) move(child);
          }
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (row.expanded) h.toggle(row, false);
          else if (row.parent >= 0) move(row.parent);
          return;
        case 'Home':
          e.preventDefault();
          move(0);
          return;
        case 'End':
          e.preventDefault();
          move(rows.length - 1);
          return;
        case 'Enter':
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) h.secondary?.(row);
          else h.primary(row);
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          h.remove?.(row);
          return;
        case 'F2':
          e.preventDefault();
          h.rename?.(row);
          return;
        case ' ':
          e.preventDefault();
          if (row.hasChildren) h.toggle(row);
          return;
        default:
          break;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const t = typeahead.current;
        t.buffer = now - t.at < 1000 ? t.buffer + e.key.toLowerCase() : e.key.toLowerCase();
        t.at = now;
        const start = t.buffer.length === 1 ? focusIndex + 1 : focusIndex;
        const n = rows.length;
        for (let step = 0; step < n; step++) {
          const i = (start + step) % n;
          if (rows[i]!.label.toLowerCase().startsWith(t.buffer)) {
            move(i);
            return;
          }
        }
      }
    },
    [rows, focusIndex, move, h]
  );

  return { focusIndex, setFocusIndex: move, onKeyDown };
}
