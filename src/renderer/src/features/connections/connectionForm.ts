import type { ConnectionInput, ConnectionMeta, EnvLabel, SslMode } from '@shared/ipc';

/** Editable form model. Numbers are kept as strings while typing. */
export interface ConnectionForm {
  id?: string;
  name: string;
  group: string;
  env: EnvLabel;
  host: string;
  port: string;
  defaultDatabase: string;
  user: string;
  password: string;
  askPassword: boolean;
  sslMode: SslMode;
  readOnly: boolean;
  connectTimeoutMs: string;
  statementTimeoutMs: string;
  poolMax: string;
  /** True when the saved connection already has a vault entry. */
  hasPassword: boolean;
}

export type FormErrors = Partial<Record<keyof ConnectionForm, string>>;

export const ENV_LABELS: EnvLabel[] = ['prod', 'staging', 'dev', 'local'];
export const SSL_MODES: SslMode[] = ['disable', 'require', 'verify-full'];

export function defaultForm(): ConnectionForm {
  return {
    name: '',
    group: '',
    env: 'local',
    host: 'localhost',
    port: '5432',
    defaultDatabase: 'postgres',
    user: 'postgres',
    password: '',
    askPassword: false,
    sslMode: 'disable',
    readOnly: false,
    connectTimeoutMs: '5000',
    statementTimeoutMs: '0',
    poolMax: '4',
    hasPassword: false
  };
}

export function formFromMeta(meta: ConnectionMeta): ConnectionForm {
  return {
    id: meta.id,
    name: meta.name,
    group: meta.group ?? '',
    env: meta.env,
    host: meta.host,
    port: String(meta.port),
    defaultDatabase: meta.defaultDatabase,
    user: meta.user,
    password: '',
    askPassword: !meta.hasPassword,
    sslMode: meta.sslMode,
    readOnly: meta.readOnly,
    connectTimeoutMs: String(meta.connectTimeoutMs),
    statementTimeoutMs: String(meta.statementTimeoutMs),
    poolMax: String(meta.poolMax),
    hasPassword: meta.hasPassword
  };
}

function intOr(v: string, fallback: number): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Converts the form to the IPC input. The password is included only when typed and not "ask every time". */
export function toConnectionInput(form: ConnectionForm): ConnectionInput {
  const input: ConnectionInput = {
    id: form.id,
    name: form.name.trim(),
    group: form.group.trim() || undefined,
    env: form.env,
    host: form.host.trim(),
    port: intOr(form.port, 5432),
    defaultDatabase: form.defaultDatabase.trim() || 'postgres',
    user: form.user.trim(),
    sslMode: form.sslMode,
    readOnly: form.readOnly,
    connectTimeoutMs: intOr(form.connectTimeoutMs, 5000),
    statementTimeoutMs: intOr(form.statementTimeoutMs, 0),
    idleTimeoutMs: 30_000,
    poolMax: intOr(form.poolMax, 4)
  };
  if (!form.askPassword && form.password !== '') input.password = form.password;
  return input;
}

export function validateForm(form: ConnectionForm, existingNames: string[]): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Name is required';
  else if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) errors.name = 'A connection with this name already exists';
  if (!form.host.trim()) errors.host = 'Host is required';
  const port = Number(form.port);
  if (!/^\d+$/.test(form.port.trim()) || port < 1 || port > 65535) errors.port = 'Port must be 1–65535';
  if (!form.user.trim()) errors.user = 'User is required';
  if (!form.defaultDatabase.trim()) errors.defaultDatabase = 'Database is required';
  for (const key of ['connectTimeoutMs', 'statementTimeoutMs', 'poolMax'] as const) {
    if (!/^\d+$/.test(form[key].trim())) errors[key] = 'Must be a whole number';
  }
  if (!errors.poolMax && Number(form.poolMax) < 1) errors.poolMax = 'At least 1';
  return errors;
}

export function isDirty(a: ConnectionForm, b: ConnectionForm): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

const SSL_PARAM: Record<string, SslMode> = {
  disable: 'disable',
  allow: 'disable',
  prefer: 'disable',
  require: 'require',
  'verify-ca': 'require',
  'verify-full': 'verify-full'
};

/** Parses postgres[ql]://user:pass@host:port/db?sslmode=… into form fields. */
export function parseConnectionUri(uri: string): Partial<ConnectionForm> | { error: string } {
  const trimmed = uri.trim();
  const m = /^postgres(?:ql)?:\/\/([^/?#]*)/i.exec(trimmed);
  if (!m) return { error: 'URI must start with postgres:// or postgresql://' };
  const authority = m[1] ?? '';
  const hostPart = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  if (!hostPart) return { error: 'URI has no host' };
  let url: URL;
  try {
    // Normalise scheme so the WHATWG parser treats it as a special-ish URL with host parsing.
    url = new URL(trimmed.replace(/^postgres(ql)?:\/\//i, 'http://'));
  } catch {
    return { error: 'Malformed URI' };
  }
  if (!url.hostname) return { error: 'URI has no host' };
  const out: Partial<ConnectionForm> = { host: decodeURIComponent(url.hostname) };
  if (url.port) out.port = url.port;
  if (url.username) out.user = decodeURIComponent(url.username);
  if (url.password) {
    out.password = decodeURIComponent(url.password);
    out.askPassword = false;
  }
  const db = url.pathname.replace(/^\//, '');
  if (db) out.defaultDatabase = decodeURIComponent(db);
  const ssl = url.searchParams.get('sslmode');
  if (ssl) {
    const mode = SSL_PARAM[ssl.toLowerCase()];
    if (!mode) return { error: `Unknown sslmode "${ssl}"` };
    out.sslMode = mode;
  }
  const appName = url.searchParams.get('application_name');
  if (appName) out.name = appName;
  return out;
}

export function isUriError(r: Partial<ConnectionForm> | { error: string }): r is { error: string } {
  return 'error' in r && typeof r.error === 'string';
}
