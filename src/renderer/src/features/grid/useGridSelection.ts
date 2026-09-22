import { useCallback, useEffect, useState } from 'react';
import { readGridState, writeGridState } from './gridSessionState';

export interface CellPos {
  row: number;
  col: number;
}

/** Row selection (checkbox / shift ranges / ⌘A) and a single focused cell with keyboard navigation. */
export function useGridSelection(rowCount: number, colCount: number, pageRows = 20, stateKey?: string) {
  const saved = readGridState(stateKey);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(saved?.selected ?? []));
  const [anchor, setAnchor] = useState<number | null>(saved?.anchor ?? null);
  const [focus, setFocus] = useState<CellPos | null>(saved?.focus ?? null);

  // Remember where this grid was left, so returning to the tab restores it.
  useEffect(() => {
    writeGridState(stateKey, { selected: [...selected], anchor, focus });
  }, [stateKey, selected, anchor, focus]);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(Array.from({ length: rowCount }, (_, i) => i)));
  }, [rowCount]);

  const toggleRow = useCallback(
    (row: number, opts: { shift?: boolean; meta?: boolean } = {}) => {
      setSelected((prev) => {
        const next = new Set(opts.meta || opts.shift ? prev : []);
        if (opts.shift && anchor !== null) {
          const [a, b] = anchor < row ? [anchor, row] : [row, anchor];
          for (let i = a; i <= b; i++) next.add(i);
          return next;
        }
        if (next.has(row) && opts.meta) next.delete(row);
        else next.add(row);
        return next;
      });
      if (!opts.shift) setAnchor(row);
    },
    [anchor]
  );

  const moveFocus = useCallback(
    (dRow: number, dCol: number, absolute?: Partial<CellPos>) => {
      setFocus((prev) => {
        const base = prev ?? { row: 0, col: 0 };
        const row = Math.min(Math.max(absolute?.row ?? base.row + dRow, 0), Math.max(rowCount - 1, 0));
        const col = Math.min(Math.max(absolute?.col ?? base.col + dCol, 0), Math.max(colCount - 1, 0));
        return { row, col };
      });
    },
    [rowCount, colCount]
  );

  /** Returns true when the key was handled. */
  const handleKey = useCallback(
    (e: React.KeyboardEvent): 'moved' | 'activate' | 'selectAll' | 'copyCell' | 'copyRows' | 'escape' | null => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'a') {
        selectAll();
        return 'selectAll';
      }
      if (meta && e.key.toLowerCase() === 'c') return e.shiftKey ? 'copyRows' : 'copyCell';
      switch (e.key) {
        case 'ArrowDown':
          moveFocus(1, 0);
          return 'moved';
        case 'ArrowUp':
          moveFocus(-1, 0);
          return 'moved';
        case 'ArrowRight':
          moveFocus(0, 1);
          return 'moved';
        case 'ArrowLeft':
          moveFocus(0, -1);
          return 'moved';
        case 'Home':
          moveFocus(0, 0, meta ? { row: 0, col: 0 } : { col: 0 });
          return 'moved';
        case 'End':
          moveFocus(0, 0, meta ? { row: rowCount - 1, col: colCount - 1 } : { col: colCount - 1 });
          return 'moved';
        case 'PageDown':
          moveFocus(pageRows, 0);
          return 'moved';
        case 'PageUp':
          moveFocus(-pageRows, 0);
          return 'moved';
        case 'Enter':
          return 'activate';
        case 'Escape':
          clear();
          return 'escape';
        case ' ':
          if (focus) toggleRow(focus.row, { meta: true });
          return 'moved';
        default:
          return null;
      }
    },
    [selectAll, moveFocus, rowCount, colCount, pageRows, clear, focus, toggleRow]
  );

  return { selected, anchor, focus, setFocus, toggleRow, selectAll, clear, moveFocus, handleKey };
}
