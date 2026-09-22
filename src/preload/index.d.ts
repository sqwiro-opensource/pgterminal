import type { PguiApi } from '@shared/ipc';

declare global {
  interface Window {
    /** Allow-listed IPC surface exposed by the preload script. */
    pgui: PguiApi;
  }
}

export {};
