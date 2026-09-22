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
  type: 'available' | 'downloaded' | 'error' | 'none';
  version?: string;
  message?: string;
}

/** Response of app:info. */
export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  dataDir: string;
}
