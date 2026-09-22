/**
 * The typed IPC contract between main and renderer. The preload derives `window.pgterminal`
 * from INVOKE_CHANNELS / PUSH_CHANNELS, so a channel absent from these maps cannot be called.
 */
import type {
  AppInfo,
  AppSettings,
  BacklinksEvent,
  BacklinksRequest,
  CatalogInvalidatedEvent,
  CatalogNode,
  CompletionIndex,
  ConnectResult,
  ConnectionEvent,
  ConnectionInput,
  ConnectionMeta,
  CountRequest,
  CountResult,
  DatabaseInfo,
  DdlRequest,
  DocLinkResolution,
  ExportRequest,
  FetchRowsRequest,
  HistoryEntry,
  MutateRowsRequest,
  MutateRowsResult,
  QueryEvent,
  ResolveDocLinkRequest,
  RowsPage,
  RunQueryRequest,
  ServerOverview,
  TestResult,
  UpdateEvent,
  WorkspaceSnapshot
} from './types';

export * from './types';

/** Request/response pairs for every `ipcRenderer.invoke` channel. */
export interface IpcInvokeMap {
  'connections:list': { req: void; res: ConnectionMeta[] };
  'connections:save': { req: ConnectionInput; res: ConnectionMeta };
  'connections:delete': { req: { connectionId: string }; res: void };
  'connections:test': { req: ConnectionInput | { connectionId: string }; res: TestResult };
  'connections:connect': { req: { connectionId: string; password?: string }; res: ConnectResult };
  'connections:disconnect': { req: { connectionId: string }; res: void };
  'connections:listDatabases': { req: { connectionId: string }; res: DatabaseInfo[] };
  'catalog:getNode': {
    req: { connectionId: string; database: string; nodeId: string; refresh?: boolean };
    res: CatalogNode;
  };
  'catalog:completionIndex': {
    req: { connectionId: string; database: string; refresh?: boolean };
    res: CompletionIndex;
  };
  'catalog:invalidate': { req: { connectionId: string; database?: string; nodeId?: string }; res: void };
  'session:open': { req: { sessionId: string; connectionId: string; database: string }; res: { pid: number } };
  'session:close': { req: { sessionId: string }; res: void };
  'query:run': { req: RunQueryRequest; res: { accepted: true } };
  'query:cancel': { req: { runId: string }; res: { sent: boolean } };
  'rows:fetch': { req: FetchRowsRequest; res: RowsPage };
  'rows:count': { req: CountRequest; res: CountResult };
  'rows:mutate': { req: MutateRowsRequest; res: MutateRowsResult };
  'doclink:resolve': { req: ResolveDocLinkRequest; res: DocLinkResolution };
  'doclink:backlinks': { req: BacklinksRequest; res: { accepted: true } };
  'doclink:cancelBacklinks': { req: { jobId: string }; res: void };
  'ddl:get': { req: DdlRequest; res: { sql: string } };
  'stats:overview': { req: { connectionId: string }; res: ServerOverview };
  'stats:cancelBackend': { req: { connectionId: string; pid: number; terminate: boolean }; res: { ok: boolean } };
  'settings:get': { req: void; res: AppSettings };
  'settings:set': { req: Partial<AppSettings>; res: AppSettings };
  'workspace:load': { req: void; res: WorkspaceSnapshot | null };
  'workspace:save': { req: WorkspaceSnapshot; res: void };
  'history:list': { req: { connectionId?: string; search?: string; limit?: number }; res: HistoryEntry[] };
  'history:clear': { req: { connectionId?: string }; res: void };
  'export:write': { req: ExportRequest; res: { path: string } | null };
  'app:info': { req: void; res: AppInfo };
  'app:checkForUpdates': { req: void; res: void };
  /** Restarts the app into a downloaded update (no-op when nothing is pending). */
  'app:quitAndInstall': { req: void; res: void };
  'app:openExternal': { req: { url: string }; res: void };
}

/** Payloads for every main → renderer push channel. */
export interface IpcPushMap {
  'query:event': QueryEvent;
  'doclink:backlinksEvent': BacklinksEvent;
  'connections:event': ConnectionEvent;
  'catalog:invalidated': CatalogInvalidatedEvent;
  'app:updateEvent': UpdateEvent;
}

/** Invoke channel name. */
export type InvokeChannel = keyof IpcInvokeMap;
/** Push channel name. */
export type PushChannel = keyof IpcPushMap;

/** Allow-list of invoke channels; must contain exactly the keys of IpcInvokeMap. */
export const INVOKE_CHANNELS = [
  'connections:list',
  'connections:save',
  'connections:delete',
  'connections:test',
  'connections:connect',
  'connections:disconnect',
  'connections:listDatabases',
  'catalog:getNode',
  'catalog:completionIndex',
  'catalog:invalidate',
  'session:open',
  'session:close',
  'query:run',
  'query:cancel',
  'rows:fetch',
  'rows:count',
  'rows:mutate',
  'doclink:resolve',
  'doclink:backlinks',
  'doclink:cancelBacklinks',
  'ddl:get',
  'stats:overview',
  'stats:cancelBackend',
  'settings:get',
  'settings:set',
  'workspace:load',
  'workspace:save',
  'history:list',
  'history:clear',
  'export:write',
  'app:info',
  'app:checkForUpdates',
  'app:quitAndInstall',
  'app:openExternal'
] as const satisfies readonly InvokeChannel[];

/** Allow-list of push channels; must contain exactly the keys of IpcPushMap. */
export const PUSH_CHANNELS = [
  'query:event',
  'doclink:backlinksEvent',
  'connections:event',
  'catalog:invalidated',
  'app:updateEvent'
] as const satisfies readonly PushChannel[];

type MissingInvoke = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>;
type MissingPush = Exclude<PushChannel, (typeof PUSH_CHANNELS)[number]>;
// Compile-time exhaustiveness: adding a channel to a map without listing it fails here.
const _invokeExhaustive: MissingInvoke extends never ? true : never = true;
const _pushExhaustive: MissingPush extends never ? true : never = true;
void _invokeExhaustive;
void _pushExhaustive;

/** Request type of an invoke channel. */
export type IpcReq<K extends InvokeChannel> = IpcInvokeMap[K]['req'];
/** Response type of an invoke channel. */
export type IpcRes<K extends InvokeChannel> = IpcInvokeMap[K]['res'];

/** Unsubscribe function returned by `on`. */
export type Unsubscribe = () => void;

/** The API exposed on `window.pgterminal`: one invoke wrapper per channel plus `on`. */
export type PgTerminalApi = {
  [K in InvokeChannel]: IpcReq<K> extends void ? () => Promise<IpcRes<K>> : (req: IpcReq<K>) => Promise<IpcRes<K>>;
} & {
  on<K extends PushChannel>(channel: K, cb: (payload: IpcPushMap[K]) => void): Unsubscribe;
};
