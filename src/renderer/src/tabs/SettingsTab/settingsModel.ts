import { DEFAULT_SETTINGS, type AppSettings } from '@shared/ipc';

/** The left-nav sections, in order. */
export const SECTIONS = [
  'appearance',
  'editor',
  'query',
  'safety',
  'data',
  'links',
  'history',
  'connections',
  'about'
] as const;

export type SectionId = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<SectionId, string> = {
  appearance: 'Appearance',
  editor: 'Editor',
  query: 'Query',
  safety: 'Safety',
  data: 'Data',
  links: 'Links',
  history: 'History',
  connections: 'Connections',
  about: 'About'
};

/** Numeric fields with their allowed range; values outside are clamped before saving. */
export const NUMERIC_BOUNDS: Partial<Record<keyof AppSettings, { min: number; max: number }>> = {
  editorFontSize: { min: 11, max: 18 },
  editorTabSize: { min: 1, max: 8 },
  queryRowCap: { min: 100, max: 200_000 },
  resultBytesCapMb: { min: 1, max: 1_024 },
  statementTimeoutMs: { min: 0, max: 3_600_000 },
  cancelTerminateAfterMs: { min: 1_000, max: 120_000 },
  destructiveLockTimeoutMs: { min: 0, max: 600_000 },
  estimateCountAbove: { min: 0, max: 1_000_000_000 },
  jsonPreviewLength: { min: 20, max: 1_000 },
  linkHoverDelayMs: { min: 0, max: 5_000 },
  backlinkScanTimeoutMs: { min: 100, max: 120_000 },
  historyRetentionDays: { min: 1, max: 3_650 },
  historyMax: { min: 100, max: 100_000 }
};

/**
 * Clamps a numeric setting into its allowed range, falling back to the default when the
 * input is not a finite number (an empty or half-typed input field).
 */
export function clampNumeric<K extends keyof AppSettings>(key: K, value: number): number {
  const bounds = NUMERIC_BOUNDS[key];
  const fallback = DEFAULT_SETTINGS[key];
  if (!Number.isFinite(value)) return typeof fallback === 'number' ? fallback : 0;
  if (!bounds) return value;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/** Env labels that require a confirmation given the current safety settings. */
export function confirmEnvs(settings: AppSettings): AppSettings['confirmOnEnv'] {
  if (settings.askConfirmAllEnvs) return ['prod', 'staging', 'dev', 'local'];
  return settings.confirmOnEnv;
}

/** Toggles one env label in `confirmOnEnv`, keeping the canonical order. */
export function toggleEnv(current: AppSettings['confirmOnEnv'], env: AppSettings['confirmOnEnv'][number]): AppSettings['confirmOnEnv'] {
  const order: AppSettings['confirmOnEnv'] = ['prod', 'staging', 'dev', 'local'];
  const next = current.includes(env) ? current.filter((e) => e !== env) : [...current, env];
  return order.filter((e) => next.includes(e));
}

/** Connection fields that may be exported; the password is never one of them. */
const EXPORTABLE = [
  'name',
  'host',
  'port',
  'user',
  'defaultDatabase',
  'sslMode',
  'env',
  'color',
  'group',
  'readOnly',
  'poolMax',
  'idleTimeoutMs',
  'statementTimeoutMs',
  'connectTimeoutMs'
] as const;

export interface ExportedConnection {
  [key: string]: unknown;
}

/** Strips ids, timestamps and any secret before a connection list leaves the app. */
export function exportConnections(list: readonly object[]): ExportedConnection[] {
  return list.map((c) => {
    const rec = c as Record<string, unknown>;
    const out: ExportedConnection = {};
    for (const k of EXPORTABLE) if (rec[k] !== undefined) out[k] = rec[k];
    return out;
  });
}

/** Parses a pasted export back into connection inputs; throws with a readable message. */
export function parseConnectionImport(text: string): ExportedConnection[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const out: ExportedConnection[] = [];
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) throw new Error('Each entry must be an object');
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string' || !rec.name.trim()) throw new Error('Each entry needs a name');
    if (typeof rec.host !== 'string' || !rec.host.trim()) throw new Error(`"${rec.name}" has no host`);
    out.push(rec);
  }
  return out;
}
