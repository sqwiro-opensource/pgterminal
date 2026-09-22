import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@renderer/store';
import type { RowDetailView } from './RowDetail';

/**
 * Row detail preferences live in settings, not tab runtime, so the panel keeps its state
 * across tabs and restarts. The split ratio is written on resize end only.
 */
export function useRowDetailSettings(): {
  open: boolean;
  view: RowDetailView;
  fields: boolean;
  ratio: number;
  setOpen(v: boolean): void;
  setView(v: RowDetailView): void;
  setFields(v: boolean): void;
  setRatio(v: number): void;
} {
  const { open, view, fields, ratio } = useStore(
    useShallow((s) => ({
      open: s.settings.rowDetailOpen,
      view: s.settings.rowDetailView,
      fields: s.settings.rowDetailFields,
      ratio: s.settings.rowDetailRatio
    }))
  );
  const update = useStore.getState().updateSettings;
  const setOpen = useCallback((v: boolean) => void update({ rowDetailOpen: v }), [update]);
  const setView = useCallback((v: RowDetailView) => void update({ rowDetailView: v }), [update]);
  const setFields = useCallback((v: boolean) => void update({ rowDetailFields: v }), [update]);
  const setRatio = useCallback(
    (v: number) => {
      const next = Math.round(Math.min(90, Math.max(20, v)));
      if (next !== Math.round(useStore.getState().settings.rowDetailRatio)) void update({ rowDetailRatio: next });
    },
    [update]
  );
  return { open, view, fields, ratio, setOpen, setView, setFields, setRatio };
}
