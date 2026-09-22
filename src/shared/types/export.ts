import type { CellValue, FieldInfo } from './query';

/** Request for export:write; main shows the save dialog. */
export interface ExportRequest {
  format: 'csv' | 'json' | 'sql';
  fields: FieldInfo[];
  rows: CellValue[][];
  table?: { schema: string; table: string };
  suggestedName: string;
}

/** Push payload on app:updateEvent. */
export interface UpdateEvent {
  type: 'checking' | 'available' | 'downloaded' | 'error' | 'none';
  version?: string;
  message?: string;
  /**
   * True when a person asked for the check (menu or Settings). Automatic checks stay silent
   * unless there is something to say; a manual one always answers, including "you are current".
   */
  manual?: boolean;
  /** Set on `none` when the build cannot update itself, e.g. a dev run. */
  unsupported?: boolean;
}

/** Push payload on app:menuCommand: the id of a renderer keybinding to run. */
export interface MenuCommand {
  command: string;
}

/** Response of app:info. */
export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  dataDir: string;
}
