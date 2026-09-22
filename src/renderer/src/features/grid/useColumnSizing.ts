import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnSizingState } from '@tanstack/react-table';
import type { GridColumn } from './gridModel';

const PREFIX = 'pgterminal.grid.sizing.';

function load(key: string | undefined): ColumnSizingState {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as ColumnSizingState) : {};
  } catch {
    return {};
  }
}

/** Column widths: defaults by kind, user resizes persisted per `sizingKey` in localStorage. */
export function useColumnSizing(columns: GridColumn[], sizingKey?: string) {
  const [sizing, setSizing] = useState<ColumnSizingState>(() => load(sizingKey));

  useEffect(() => {
    setSizing(load(sizingKey));
  }, [sizingKey]);

  useEffect(() => {
    if (!sizingKey) return;
    try {
      if (Object.keys(sizing).length) localStorage.setItem(PREFIX + sizingKey, JSON.stringify(sizing));
    } catch {
      // storage unavailable — sizes stay in memory
    }
  }, [sizing, sizingKey]);

  const widthOf = useCallback((c: GridColumn) => Math.max(48, sizing[c.id] ?? c.width), [sizing]);

  const total = useMemo(() => columns.reduce((n, c) => n + widthOf(c), 0), [columns, widthOf]);

  return { sizing, setSizing, widthOf, total };
}
