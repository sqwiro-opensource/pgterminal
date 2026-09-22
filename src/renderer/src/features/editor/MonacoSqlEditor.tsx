import { useEffect } from 'react';
import { format as formatWithLib } from 'sql-formatter';
import type { CompletionIndex } from '@shared/types/catalog';
import type { PgErrorInfo } from '@shared/types/query';
import { statementAt } from '@shared/sql/statementSplitter';
import { monaco } from './monacoSetup';
import { setEditorIndex } from './editorRegistry';
import { useMonacoEditor } from './useMonacoEditor';

export type RunKind = 'all' | 'selection' | 'statement';

export interface MonacoSqlEditorProps {
  modelKey: string;
  value: string;
  onChange(value: string): void;
  onRun?(kind: RunKind): void;
  onCancel?(): void;
  onFormat?(): void;
  onExplain?(): void;
  markers?: PgErrorInfo[];
  readOnly?: boolean;
  completionIndex?: CompletionIndex;
  onCursor?(pos: { line: number; col: number }): void;
  /** Receives the editor instance once created (for `getSelectionOrStatement`). */
  onReady?(editor: monaco.editor.IStandaloneCodeEditor): void;
  className?: string;
}

/** Selected text, or the statement under the cursor when nothing is selected. */
export function getSelectionOrStatement(editor: monaco.editor.IStandaloneCodeEditor): {
  text: string;
  range: monaco.IRange;
  kind: 'selection' | 'statement';
} | null {
  const model = editor.getModel();
  if (!model) return null;
  const sel = editor.getSelection();
  if (sel && !sel.isEmpty()) return { text: model.getValueInRange(sel), range: sel, kind: 'selection' };
  const pos = editor.getPosition() ?? new monaco.Position(1, 1);
  const stmt = statementAt(model.getValue(), model.getOffsetAt(pos));
  if (!stmt) return null;
  const start = model.getPositionAt(stmt.start);
  const end = model.getPositionAt(stmt.end);
  return {
    text: stmt.text,
    range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
    kind: 'statement'
  };
}

/** sql-formatter with PostgreSQL dialect; returns the input unchanged when it cannot be parsed. */
export function formatSql(text: string): string {
  try {
    return formatWithLib(text, { language: 'postgresql', keywordCase: 'upper', tabWidth: 2 });
  } catch {
    return text;
  }
}

const NO_WIDGETS = '!suggestWidgetVisible && !findWidgetVisible && !renameInputVisible';

export function MonacoSqlEditor(props: MonacoSqlEditorProps): JSX.Element {
  const { containerRef, editor } = useMonacoEditor({
    modelKey: props.modelKey,
    language: 'sql',
    value: props.value,
    onChange: props.onChange,
    ...(props.readOnly !== undefined ? { readOnly: props.readOnly } : {}),
    ...(props.markers ? { markers: props.markers } : {}),
    ...(props.onCursor ? { onCursor: props.onCursor } : {})
  });

  useEffect(() => {
    setEditorIndex(props.modelKey, props.completionIndex);
    return () => setEditorIndex(props.modelKey, undefined);
  }, [props.modelKey, props.completionIndex]);

  const { onRun, onCancel, onFormat, onExplain, onReady } = props;
  useEffect(() => {
    if (!editor) return;
    onReady?.(editor);
    const subs: monaco.IDisposable[] = [
      editor.addAction({
        id: 'pgui.run',
        label: 'Run',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => onRun?.('all')
      }),
      editor.addAction({
        id: 'pgui.runSelection',
        label: 'Run selection or statement',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
        run: (ed) => {
          const sel = ed.getSelection();
          onRun?.(sel && !sel.isEmpty() ? 'selection' : 'statement');
        }
      }),
      editor.addAction({
        id: 'pgui.format',
        label: 'Format SQL',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
        run: () => onFormat?.()
      }),
      editor.addAction({
        id: 'pgui.explain',
        label: 'Explain',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE],
        run: () => onExplain?.()
      }),
      editor.addAction({
        id: 'pgui.cancel',
        label: 'Cancel running query',
        keybindings: [monaco.KeyCode.Escape],
        precondition: NO_WIDGETS,
        run: () => onCancel?.()
      })
    ];
    return () => {
      for (const s of subs) s.dispose();
    };
  }, [editor, onRun, onCancel, onFormat, onExplain, onReady]);

  return <div ref={containerRef} className={props.className ?? 'h-full w-full min-h-0'} />;
}

export default MonacoSqlEditor;
