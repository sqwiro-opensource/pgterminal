import type { HistoryEntry } from '@shared/ipc';
import { getPgui } from '../lib/ipc';
import type { SliceCreator } from './index';

export interface HistorySlice {
  history: HistoryEntry[];
  historyLoaded: boolean;
  historySearch: string;
  historyOpen: boolean;
  loadHistory(connectionId?: string): Promise<void>;
  clearHistory(connectionId?: string): Promise<void>;
  setHistorySearch(v: string): void;
  toggleHistory(open?: boolean): void;
}

export const createHistorySlice: SliceCreator<HistorySlice> = (set, get) => ({
  history: [],
  historyLoaded: false,
  historySearch: '',
  historyOpen: false,

  async loadHistory(connectionId) {
    const search = get().historySearch.trim();
    const history = await getPgui()['history:list']({
      ...(connectionId ? { connectionId } : {}),
      ...(search ? { search } : {}),
      limit: 500
    });
    set({ history, historyLoaded: true });
  },

  async clearHistory(connectionId) {
    await getPgui()['history:clear']({ ...(connectionId ? { connectionId } : {}) });
    await get().loadHistory();
  },

  setHistorySearch(v) {
    set({ historySearch: v });
  },

  toggleHistory(open) {
    const next = open ?? !get().historyOpen;
    set({ historyOpen: next });
    if (next) void get().loadHistory().catch(() => undefined);
  }
});
