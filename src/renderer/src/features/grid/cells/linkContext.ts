import { createContext, useContext } from 'react';

/** Where a grid's values live, so cells can resolve document links without prop threading. */
export interface GridLinkContextValue {
  connectionId?: string;
  database?: string;
  fromTabId?: string;
  /** Column → FK target for sole-column FKs (derived chips). */
  fkColumns?: Record<string, { schema: string; table: string }>;
  /** When true (a cell is being edited) values render as raw text, never as chips. */
  editing?: boolean;
}

export const GridLinkContext = createContext<GridLinkContextValue>({});

export function useGridLinkContext(): GridLinkContextValue {
  return useContext(GridLinkContext);
}
