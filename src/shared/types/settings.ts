import type { EnvLabel } from './connection';
import type { BacklinkScopeMode } from './doclink';

/** How timestamps are rendered in grids and document trees. */
export type DateTimeFormat = 'iso' | 'locale';

/** User settings, persisted by main. */
export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  density: 'compact' | 'default' | 'comfortable';
  /** Root UI font size in px. */
  uiFontSize: 12 | 13 | 14;
  editorFontSize: number;
  /** CSS font stack for Monaco; empty string = the app's mono stack. */
  editorFontFamily: string;
  editorTabSize: number;
  editorInsertSpaces: boolean;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorAutocomplete: boolean;
  /** Uppercase keywords when formatting SQL on demand. */
  formatUppercaseKeywords: boolean;
  gridPageSize: 50 | 100 | 200 | 500 | 1000;
  queryRowCap: number;
  resultBytesCapMb: number;
  /** 0 = none. */
  statementTimeoutMs: number;
  /** New query tabs start in autocommit rather than manual transaction mode. */
  autocommitDefault: boolean;
  /** Keep running a script after a statement fails. */
  continueOnError: boolean;
  /** Offer to terminate the backend this long after a cancel has not taken effect. */
  cancelTerminateAfterMs: number;
  showInternalSchemas: boolean;
  /** Env labels on which destructive actions require confirmation. */
  confirmOnEnv: EnvLabel[];
  typedConfirmOnProd: boolean;
  warnNoWhere: boolean;
  /** Force typed confirmation on every environment, not only the ticked ones. */
  askConfirmAllEnvs: boolean;
  /** Grid Apply shows the generated statements before executing them. */
  previewSqlBeforeApply: boolean;
  /** `SET LOCAL lock_timeout` for destructive DDL so a DROP fails instead of queueing. */
  destructiveLockTimeoutMs: number;
  /** Text shown for SQL NULL in grids and trees. */
  nullText: string;
  dateTimeFormat: DateTimeFormat;
  /** Rows above this estimate show `~` instead of an exact count until asked. */
  estimateCountAbove: number;
  /** Characters of a jsonb value previewed in one grid line. */
  jsonPreviewLength: number;
  /** Row detail panel open by default in grids. */
  rowDetailOpen: boolean;
  /** Row detail rendering: collapsible tree or raw JSON. */
  rowDetailView: 'tree' | 'json';
  /** Show the column/type list at the top of the row detail. */
  rowDetailFields: boolean;
  /** Width of the grid pane beside the row detail, as a percentage. */
  rowDetailRatio: number;
  backlinkScopeDefault: BacklinkScopeMode;
  linkFkColumns: boolean;
  linkUnresolved: boolean;
  /** Delay before a link chip shows its hover preview. */
  linkHoverDelayMs: number;
  /** Per-table cap for jsonb/text backlink scans. */
  backlinkScanTimeoutMs: number;
  historyRetentionDays: number;
  historyMax: number;
  autoUpdate: boolean;
  /** Reconnect saved connections that have a stored password on launch. */
  reconnectOnLaunch: boolean;
}

/** Defaults from requirement.html §8. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  density: 'default',
  uiFontSize: 13,
  editorFontSize: 13,
  editorFontFamily: '',
  editorTabSize: 2,
  editorInsertSpaces: true,
  editorWordWrap: false,
  editorMinimap: false,
  editorAutocomplete: true,
  formatUppercaseKeywords: true,
  gridPageSize: 100,
  queryRowCap: 10_000,
  resultBytesCapMb: 64,
  statementTimeoutMs: 0,
  autocommitDefault: true,
  continueOnError: false,
  cancelTerminateAfterMs: 5_000,
  showInternalSchemas: false,
  confirmOnEnv: ['prod'],
  typedConfirmOnProd: true,
  warnNoWhere: true,
  askConfirmAllEnvs: false,
  previewSqlBeforeApply: true,
  destructiveLockTimeoutMs: 5_000,
  nullText: 'NULL',
  dateTimeFormat: 'iso',
  estimateCountAbove: 100_000,
  jsonPreviewLength: 120,
  rowDetailOpen: true,
  rowDetailView: 'tree',
  rowDetailFields: false,
  rowDetailRatio: 70,
  backlinkScopeDefault: 'sameSchema',
  linkFkColumns: true,
  linkUnresolved: false,
  linkHoverDelayMs: 400,
  backlinkScanTimeoutMs: 5_000,
  historyRetentionDays: 30,
  historyMax: 5_000,
  autoUpdate: true,
  reconnectOnLaunch: true
};
