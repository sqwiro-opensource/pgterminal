import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import { CircleAlert, Unlink } from 'lucide-react';
import type { Tab } from '@shared/ipc';
import type { DocTarget } from '@shared/types/doclink';
import { useStore } from '@renderer/store';
import { Skeleton } from '@renderer/components/ui/Skeleton';
import { confirm } from '@renderer/components/ui/ConfirmDialog';
import { docLinks } from '@renderer/features/doclink/docLinksService';
import { BacklinksPanel } from './BacklinksPanel';
import { DocTree } from './DocTree';
import { Header } from './Header';
import { JsonEditorView } from './JsonEditorView';
import { ReferencesPanel } from './ReferencesPanel';
import { SaveDiffSheet } from './SaveDiffSheet';
import { deletePreviewSql, diffRow, draftToJsonText } from './documentModel';
import { useDocument } from './useDocument';
import { copyText } from '@renderer/lib/clipboard';

/** Document tab: one row as a navigable document with references, backlinks and editing. */
export default function DocumentTab({ tab }: { tab: Tab }): JSX.Element {
  const t = tab as Tab<'document'>;
  const { connectionId, database, history, index, view } = t.params;
  const target = history[index] ?? history[history.length - 1];
  if (!target) return <div className="p-4 text-[12.5px] text-muted-foreground">Empty document tab.</div>;
  return <DocumentBody tab={t} target={target} connectionId={connectionId} database={database} view={view} />;
}

function DocumentBody({ tab, target, connectionId, database, view }: { tab: Tab<'document'>; target: DocTarget; connectionId: string; database: string; view: 'tree' | 'json' }): JSX.Element {
  const { updateParams, setTitle, openTab, closeTab } = useStore((s) => ({ updateParams: s.updateParams, setTitle: s.setTitle, openTab: s.openTab, closeTab: s.closeTab }));
  const meta = useStore((s) => s.connections[connectionId]);
  const readOnly = meta?.readOnly ?? false;
  const [state, act] = useDocument(tab.id, connectionId, database, target);
  const [sheet, setSheet] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const { history, index } = tab.params;

  useEffect(() => {
    setTitle(tab.id, `${target.table}/${target.keyValue}`);
  }, [tab.id, target.table, target.keyValue, setTitle]);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= history.length) return;
      updateParams<'document'>(tab.id, { index: next });
    },
    [index, history.length, tab.id, updateParams]
  );

  /**
   * The toggle is also a preference: the next document opens the way this one was left, which is
   * why the choice goes to settings as well as to this tab's params.
   */
  const setView = useCallback(
    (v: 'tree' | 'json') => {
      updateParams<'document'>(tab.id, { view: v });
      void useStore.getState().updateSettings({ documentView: v });
    },
    [tab.id, updateParams]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const active = useStore.getState().activeTabId === tab.id;
      if (!active) return;
      // `e.target` is not always an Element (document, text nodes), so guard before `closest`.
      const el = e.target instanceof Element ? e.target : null;
      const inEditor = el?.closest('.monaco-editor, input, textarea');
      if (e.key === '[' && !inEditor) {
        e.preventDefault();
        go(-1);
      } else if (e.key === ']' && !inEditor) {
        e.preventDefault();
        go(1);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state.dirty && !readOnly) setSheet(true);
      } else if (e.key.toLowerCase() === 'j' && e.shiftKey) {
        e.preventDefault();
        setView(view === 'tree' ? 'json' : 'tree');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, state.dirty, readOnly, tab.id, setView, view]);

  const diff = useMemo(() => (state.row ? diffRow(state.row, state.draft, state.fields) : []), [state.row, state.draft, state.fields]);
  const readOnlyColumns = useMemo(() => ['_id', ...state.pkColumns], [state.pkColumns]);

  const onDelete = (): void => {
    const pk = act.pk();
    confirm({
      title: `Delete ${target.table}/${target.keyValue}`,
      verb: 'Delete row',
      variant: 'destructive',
      env: meta?.env,
      connectionName: meta?.name,
      summary: `This permanently deletes one row from ${target.schema}.${target.table}.`,
      buildSql: () => deletePreviewSql(target.schema, target.table, pk),
      ...(meta?.env === 'prod' ? { typedName: target.table } : {}),
      onOpenInEditor: (sql) => openTab('query', { connectionId, database, sessionId: crypto.randomUUID(), sql }),
      onConfirm: async () => {
        await act.remove();
        toast.success(`Deleted ${target.table}/${target.keyValue}`);
        closeTab(tab.id);
      }
    });
  };

  const openTable = (): void => {
    openTab('table-data', { connectionId, database, schema: target.schema, table: target.table, filters: docLinks.tableDataFilter(target), sort: [], page: { mode: 'keyset', after: null } });
  };
  const openStructure = (): void => {
    openTab('table-structure', { connectionId, database, schema: target.schema, table: target.table, section: 'columns' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        serverName={meta?.name ?? connectionId}
        database={database}
        target={target}
        canBack={index > 0}
        canForward={index < history.length - 1}
        view={view}
        dirty={state.dirty}
        saving={state.saving}
        readOnly={readOnly}
        onBack={() => go(-1)}
        onForward={() => go(1)}
        onView={setView}
        onOpenTable={openTable}
        onOpenStructure={openStructure}
        onReload={() => void act.reload()}
        onCopyJson={() => void copyText(draftToJsonText(state.draft, state.fields), 'JSON')}
        onCopyId={() => void copyText(String(state.row?._id ?? target.keyValue), '_id')}
        onDelete={onDelete}
        onSave={() => (jsonError ? toast.error(jsonError) : setSheet(true))}
      />
      {state.error && (
        <div className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px]">
          <CircleAlert size={14} strokeWidth={1.75} className="text-destructive" /> {state.error.message}
          <button type="button" className="ml-auto rounded border border-border px-2 py-0.5 text-[12px] hover:bg-accent" onClick={() => void act.reload()}>
            Retry
          </button>
        </div>
      )}
      {state.notFound && !state.loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Unlink size={20} strokeWidth={1.5} />
          No row with {target.keyColumn} = <span className="font-mono">{target.keyValue}</span> in {target.schema}.{target.table}
          <div className="flex gap-2">
            <button type="button" className="rounded border border-border px-2 py-1 text-[12px] hover:bg-accent" onClick={openTable}>
              Open table
            </button>
            <button type="button" className="rounded border border-border px-2 py-1 text-[12px] hover:bg-accent" onClick={() => closeTab(tab.id)}>
              Close
            </button>
          </div>
        </div>
      )}
      {!state.notFound && (
        <PanelGroup direction="horizontal" className="min-h-0 flex-1">
          <Panel defaultSize={62} minSize={40} className="min-h-0">
            {state.loading && !state.row ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-4" style={{ width: `${70 - (i % 4) * 12}%` }} />
                ))}
              </div>
            ) : state.row ? (
              <div className="h-full min-h-0 overflow-auto">
                {view === 'tree' ? (
                  <DocTree
                    fields={state.fields}
                    row={state.row}
                    draft={state.draft}
                    connectionId={connectionId}
                    database={database}
                    tabId={tab.id}
                    readOnlyColumns={readOnlyColumns}
                    onChange={act.setColumn}
                    onEditJson={() => setView('json')}
                  />
                ) : (
                  <JsonEditorView
                    tabId={tab.id}
                    connectionId={connectionId}
                    database={database}
                    fields={state.fields}
                    original={state.row}
                    draft={state.draft}
                    docKey={`${target.schema}.${target.table}/${target.keyValue}`}
                    onDraft={act.setDraft}
                    onError={setJsonError}
                  />
                )}
              </div>
            ) : null}
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-primary/40" />
          <Panel defaultSize={38} minSize={24} className="min-h-0">
            {state.row && (
              <PanelGroup direction="vertical">
                <Panel defaultSize={40} minSize={20}>
                  <ReferencesPanel fields={state.fields} row={state.row} ctx={{ connectionId, database, fromTabId: tab.id }} />
                </Panel>
                <PanelResizeHandle className="h-px bg-border hover:bg-primary/40" />
                <Panel defaultSize={60} minSize={20}>
                  <BacklinksPanel connectionId={connectionId} database={database} target={target} row={state.row} />
                </Panel>
              </PanelGroup>
            )}
          </Panel>
        </PanelGroup>
      )}
      <div className="flex h-7 flex-none items-center gap-3 border-t border-border px-3 text-[11.5px] text-muted-foreground">
        {state.dirty ? (
          <>
            <span className="text-pending">✎ {diff.length} field{diff.length === 1 ? '' : 's'} changed</span>
            <button type="button" className="underline decoration-dotted hover:text-foreground" onClick={() => setSheet(true)}>
              View diff
            </button>
            <button type="button" className="underline decoration-dotted hover:text-foreground" onClick={act.discard}>
              Discard
            </button>
          </>
        ) : (
          <span>{state.loading ? 'Loading…' : 'No unsaved changes'}</span>
        )}
        {state.savedAt && <span className="ml-auto">Saved {new Date(state.savedAt).toLocaleTimeString()}</span>}
      </div>
      <SaveDiffSheet
        open={sheet}
        schema={target.schema}
        table={target.table}
        fields={state.fields}
        diff={diff}
        pk={act.pk()}
        error={state.saveError}
        onCancel={() => setSheet(false)}
        onConfirm={async () => {
          const ok = await act.save();
          if (ok) setSheet(false);
          return ok;
        }}
      />
    </div>
  );
}
