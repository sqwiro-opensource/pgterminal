import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { PgErrorInfo } from '@shared/types/query';
import type { Tab } from '@shared/types/workspace';
import { useStore } from '@renderer/store';
import { ResultsPanel } from './ResultsPanel';
import { Toolbar } from './Toolbar';
import { ensureQueryRuntime } from './runManager';
import { useQueryRun } from './useQueryRun';

type EditorModule = typeof import('@renderer/features/editor');
type Editor = import('@renderer/features/editor').monaco.editor.IStandaloneCodeEditor;

let editorModulePromise: Promise<EditorModule> | null = null;
/** Monaco loads on the first query tab, never at startup. */
function loadEditor(): Promise<EditorModule> {
  editorModulePromise ??= import('@renderer/features/editor').then((m) => {
    m.setupMonaco();
    return m;
  });
  return editorModulePromise;
}

export default function QueryTab({ tab }: { tab: Tab }): JSX.Element {
  const q = tab as Tab<'query'>;
  const { connectionId, database, sql } = q.params;
  const { rt, actions, elapsedMs } = useQueryRun(q.id);
  const [mod, setMod] = useState<EditorModule | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const { connection, connections, databases, completionIndex, density, updateParams, setDirty, toggleHistory, openTab } = useStore(
    useShallow((s) => ({
      connection: s.connections[connectionId],
      connections: Object.values(s.connections).filter((c) => s.status[c.id]?.state === 'connected'),
      databases: s.status[connectionId]?.databases ?? [],
      completionIndex: s.completionIndex[`${connectionId}/${database}`],
      density: s.settings.density,
      updateParams: s.updateParams,
      setDirty: s.setDirty,
      toggleHistory: s.toggleHistory,
      openTab: s.openTab
    }))
  );

  useEffect(() => {
    ensureQueryRuntime();
    let alive = true;
    loadEditor().then((m) => alive && setMod(m)).catch((err: Error) => toast.error('Editor failed to load', { description: err.message }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void useStore.getState().ensureCompletionIndex(connectionId, database);
  }, [connectionId, database]);

  const currentText = useCallback((): string => editorRef.current?.getValue() ?? sql, [sql]);

  const onChange = useCallback(
    (v: string) => {
      updateParams<'query'>(q.id, { sql: v });
      setDirty(q.id, v.trim().length > 0);
    },
    [q.id, updateParams, setDirty]
  );

  const runAll = useCallback(() => void actions.run(currentText(), 'script'), [actions, currentText]);
  const runStatement = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || !mod) return;
    const sel = mod.getSelectionOrStatement(ed);
    if (!sel) return;
    void actions.run(sel.text, sel.kind === 'selection' ? 'script' : 'single');
  }, [actions, mod]);
  const onRun = useCallback((kind: 'all' | 'selection' | 'statement') => (kind === 'all' ? runAll() : runStatement()), [runAll, runStatement]);
  const onExplain = useCallback(
    (analyze: boolean) => {
      const ed = editorRef.current;
      const sel = ed && mod ? mod.getSelectionOrStatement(ed) : null;
      void actions.run(sel?.text ?? currentText(), sel && sel.kind === 'statement' ? 'single' : 'script', { analyze });
    },
    [actions, mod, currentText]
  );
  const onFormat = useCallback(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !mod || !model) return;
    const formatted = mod.formatSql(model.getValue());
    if (formatted !== model.getValue()) model.pushEditOperations([], [{ range: model.getFullModelRange(), text: formatted }], () => null);
  }, [mod]);
  const onCancel = useCallback(() => void actions.cancel(), [actions]);
  const onReady = useCallback((ed: Editor) => {
    editorRef.current = ed;
  }, []);
  const onShowInEditor = useCallback((e: PgErrorInfo) => {
    const ed = editorRef.current;
    if (!ed || !e.line) return;
    ed.revealLineInCenter(e.line);
    ed.setPosition({ lineNumber: e.line, column: e.col ?? 1 });
    ed.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = /Mac/i.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      if (mod && e.key === '.') {
        e.preventDefault();
        onCancel();
      }
      if (mod && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        onExplain(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onExplain]);

  const Editor = mod?.MonacoSqlEditor;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        rt={rt}
        elapsedMs={elapsedMs}
        connection={connection}
        connections={connections}
        databases={databases}
        database={database}
        editorReady={Boolean(mod)}
        onRun={onRun}
        onExplain={onExplain}
        onFormat={onFormat}
        onCancel={onCancel}
        onLimit={actions.setLimit}
        onTxMode={actions.setTxMode}
        onDatabase={(db) => void actions.switchDatabase(db)}
        onConnection={(id) => {
          if (id !== connectionId) openTab('query', { ...q.params, connectionId: id, sessionId: crypto.randomUUID() }, { reuse: false, title: q.title });
        }}
        onHistory={() => toggleHistory(true)}
      />
      <PanelGroup direction="vertical" className="min-h-0 flex-1">
        <Panel defaultSize={rt.ratio} minSize={15} onResize={(size) => actions.setRatio(size)} className="min-h-0">
          {Editor ? (
            <Editor
              modelKey={q.id}
              value={sql}
              onChange={onChange}
              onRun={onRun}
              onCancel={onCancel}
              onFormat={onFormat}
              onExplain={() => onExplain(false)}
              markers={rt.markers}
              readOnly={false}
              {...(completionIndex ? { completionIndex } : {})}
              onCursor={actions.setCursor}
              onReady={onReady}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">Loading editor…</div>
          )}
        </Panel>
        <PanelResizeHandle className="h-px bg-border data-[resize-handle-active]:bg-primary" />
        <Panel minSize={15} className="min-h-0">
          <ResultsPanel
            tabId={tab.id}
            rt={rt}
            density={density}
            onView={actions.setView}
            onLoadMore={(i) => void actions.loadMore(i)}
            onExactCount={(i) => actions.exactCount(i).catch((err: Error) => toast.error('Count failed', { description: err.message }))}
            onShowInEditor={onShowInEditor}
            linkCtx={{ connectionId, database, fromTabId: tab.id }}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
