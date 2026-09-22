import type { PgTerminalApi } from '@shared/ipc';

declare global {
  interface Window {
    /** Allow-listed IPC surface exposed by the preload script. */
    pgterminal: PgTerminalApi;
  }
}

export {};
