/** TLS mode for a PostgreSQL connection. */
export type SslMode = 'disable' | 'require' | 'verify-full';

/** Environment label that drives badge colour and confirmation rules. */
export type EnvLabel = 'prod' | 'staging' | 'dev' | 'local';

/** A saved connection. Never carries a password; `hasPassword` reflects the vault. */
export interface ConnectionMeta {
  /** Stable uuid; key for pools, tabs and the vault. */
  id: string;
  /** Unique display name. */
  name: string;
  host: string;
  port: number;
  user: string;
  /** Database opened on connect. */
  defaultDatabase: string;
  sslMode: SslMode;
  env: EnvLabel;
  /** Optional colour override for the badge. */
  color?: string;
  /** Optional sidebar group. */
  group?: string;
  /** Opens pools with default_transaction_read_only=on. */
  readOnly: boolean;
  poolMax: number;
  idleTimeoutMs: number;
  /** 0 = none. */
  statementTimeoutMs: number;
  connectTimeoutMs: number;
  /** True when the vault holds a secret for this id. */
  hasPassword: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Input for save/test. The only IPC payload that may carry a password. */
export type ConnectionInput = Omit<ConnectionMeta, 'hasPassword' | 'createdAt' | 'updatedAt' | 'id'> & {
  id?: string;
  password?: string;
};

/** Facts about a server learned on connect. */
export interface ServerInfo {
  version: string;
  versionNum: number;
  serverEncoding: string;
  isSuperuser: boolean;
  extensions: string[];
}

/** One row of pg_database as shown in the tree. */
export interface DatabaseInfo {
  name: string;
  owner: string;
  encoding: string;
  /** Bigint as string; null when size is not readable. */
  sizeBytes: string | null;
  isTemplate: boolean;
  allowConn: boolean;
}

/** Result of connections:test. Never persists anything. */
export interface TestResult {
  ok: boolean;
  server?: ServerInfo;
  latencyMs: number;
  error?: import('./query').PgErrorInfo;
  passwordStored?: boolean;
}

/** Result of connections:connect. */
export interface ConnectResult {
  server: ServerInfo;
  databases: DatabaseInfo[];
  searchPath: string[];
}

/** Push payload on connections:event. */
export interface ConnectionEvent {
  connectionId: string;
  type: 'connected' | 'disconnected' | 'poolError';
  error?: import('./query').PgErrorInfo;
}
