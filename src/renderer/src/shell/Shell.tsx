import { useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { useShallow } from 'zustand/react/shallow';
import { tabConnectionId } from '@shared/workspace/tabId';
import { useStore } from '../store';
import { useConnectionEvents } from '../store/useConnectionEvents';
import { useReconnect } from '../features/connections/useReconnect';
import { useAppearance } from '../lib/appearance';
import { TabView } from '../tabs/registry';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { TitleBar } from './TitleBar';
import { WelcomeScreen } from './WelcomeScreen';
import { HistoryDrawer } from '../features/history/HistoryDrawer';
import { CommandPalette } from './CommandPalette';
import { ShortcutSheet } from '../components/ShortcutSheet';
import { openPalette } from '../lib/keybindings';

/** Breadcrumb for the title bar: server › database › schema.object, or the tab title. */
function useCrumbs(): string[] {
  return useStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab) return [];
      const cid = tabConnectionId(tab);
      const p = tab.params as { database?: string; schema?: string; table?: string; name?: string };
      const out: string[] = [];
      if (cid) out.push(s.connections[cid]?.name ?? cid);
      if (p.database) out.push(p.database);
      if (p.schema && (p.table || p.name)) out.push(`${p.schema}.${p.table ?? p.name}`);
      else if (!p.database) out.push(tab.title);
      else if (tab.kind !== 'table-data') out.push(tab.title);
      return out;
    })
  );
}

/**
 * Application frame: title bar / [sidebar | main] / status bar. Tabs are the navigation; the
 * welcome screen shows when no tab is open. The frame is sized in percentages, not `vw`/`vh`:
 * the UI font-size setting zooms the root element, and viewport units ignore that zoom, so a
 * `h-screen` frame paints short of the window edge at any size but 13px.
 * TODO: optional inspector panel on the right (Phase 4 uses it for document peeks).
 */
export function Shell(): JSX.Element {
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const { activeTab, sidebarCollapsed, setSidebarCollapsed, sidebarWidth, setSidebarWidth, inspectorVisible, setInspectorVisible, openConnectionsView, openTab } =
    useStore(
      useShallow((s) => ({
        activeTab: s.tabs.find((t) => t.id === s.activeTabId) ?? null,
        sidebarCollapsed: s.sidebarCollapsed,
        setSidebarCollapsed: s.setSidebarCollapsed,
        sidebarWidth: s.sidebarWidth,
        setSidebarWidth: s.setSidebarWidth,
        inspectorVisible: s.inspectorVisible,
        setInspectorVisible: s.setInspectorVisible,
        openConnectionsView: s.openConnectionsView,
        openTab: s.openTab
      }))
    );
  const crumbs = useCrumbs();
  useConnectionEvents();
  useReconnect();
  useAppearance();

  // Store → panel: ⌘B toggles via the store; mirror it onto the imperative panel handle.
  useEffect(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (sidebarCollapsed && !p.isCollapsed()) p.collapse();
    if (!sidebarCollapsed && p.isCollapsed()) p.expand();
  }, [sidebarCollapsed]);

  const onNewConnection = (): void => openConnectionsView(null);
  const onManage = (): void => openConnectionsView(undefined);
  const onEditConnection = (id: string): void => openConnectionsView(id);

  return (
    <div className="grid h-full w-full grid-rows-[38px_1fr_24px] bg-background">
      <TitleBar
        crumbs={crumbs}
        sidebarVisible={!sidebarCollapsed}
        inspectorVisible={inspectorVisible}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onToggleInspector={() => setInspectorVisible(!inspectorVisible)}
        onOpenPalette={() => openPalette('')}
        onOpenSettings={() => openTab('settings', {})}
      />

      <PanelGroup direction="horizontal" className="min-h-0">
        <Panel
          ref={sidebarRef}
          defaultSize={sidebarWidth}
          minSize={12}
          maxSize={40}
          collapsible
          collapsedSize={0}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
          onResize={(size) => {
            if (size > 0) setSidebarWidth(size);
          }}
          className="min-h-0"
        >
          <Sidebar onNewConnection={onNewConnection} onManage={onManage} onEditConnection={onEditConnection} />
        </Panel>
        <PanelResizeHandle className="group relative w-px bg-border outline-none after:absolute after:inset-y-0 after:-left-[2px] after:w-1 after:content-[''] data-[resize-handle-active]:bg-primary hover:bg-primary/60" />
        <Panel minSize={30} className="min-h-0">
          <main className="relative flex h-full min-h-0 flex-col bg-background">
            <HistoryDrawer />
            <TabBar />
            <div className="min-h-0 flex-1">
              {activeTab ? (
                <TabView key={activeTab.id} tab={activeTab} />
              ) : (
                <WelcomeScreen onNewConnection={onNewConnection} onManageConnections={onManage} />
              )}
            </div>
          </main>
        </Panel>
      </PanelGroup>

      <StatusBar />
      <CommandPalette />
      <ShortcutSheet />
    </div>
  );
}
