import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Skeleton } from '@renderer/components/ui/Skeleton';
import type { Tab, TabKind } from '@shared/ipc';
import { tabConnectionId } from '@shared/workspace/tabId';
import { useStore } from '../store';
import { HibernatedTab } from './HibernatedTab';
import { TabErrorBoundary } from './TabErrorBoundary';

export type TabComponent<K extends TabKind = TabKind> = ComponentType<{ tab: Tab<K> }>;
type TabComponents = { [K in TabKind]: LazyExoticComponent<TabComponent<K>> };

const PlaceholderTab = lazy(() => import('./PlaceholderTab'));

/**
 * Tab kind → lazily loaded component. Adding a kind means adding a row here; the workspace store
 * holds only serialisable descriptors and never React elements.
 */
export const TAB_COMPONENTS: TabComponents = {
  query: lazy(() => import('./QueryTab')),
  'table-data': lazy(() => import('./TableDataTab')),
  'table-structure': lazy(() => import('./TableStructureTab')),
  document: lazy(() => import('./DocumentTab')),
  'server-overview': lazy(() => import('./ServerOverviewTab')),
  'ddl-preview': lazy(() => import('./DdlPreviewTab')),
  function: PlaceholderTab,
  connections: lazy(async () => {
    const m = await import('../features/connections/ConnectionsTab');
    const Wrapped: TabComponent<'connections'> = () => <m.ConnectionsTab />;
    return { default: Wrapped };
  }),
  settings: lazy(() => import('./SettingsTab'))
};

function ErrorTab({ tab }: { tab: Tab }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
      Unknown tab kind <code className="mx-1 font-mono">{String(tab.kind)}</code> — close this tab.
    </div>
  );
}

function TabSkeleton(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-2 h-40 w-full" />
    </div>
  );
}

/** Renders one tab: hibernated placeholder when its connection is down, else the kind's component. */
export function TabView({ tab }: { tab: Tab }): JSX.Element {
  const connectionId = tabConnectionId(tab);
  const connected = useStore((s) => (connectionId ? s.status[connectionId]?.state === 'connected' : true));
  const Cmp = (TAB_COMPONENTS as Record<string, LazyExoticComponent<TabComponent> | undefined>)[tab.kind];
  if (!Cmp) return <ErrorTab tab={tab} />;
  if (connectionId && !connected) return <HibernatedTab tab={tab} connectionId={connectionId} />;
  return (
    <TabErrorBoundary tabId={tab.id}>
      <Suspense fallback={<TabSkeleton />}>
        <Cmp tab={tab} />
      </Suspense>
    </TabErrorBoundary>
  );
}
