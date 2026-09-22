import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PgErrorInfo } from '@shared/types/query';
import { useTheme } from '@renderer/lib/theme';
import { monaco, MONO_FONT, defineEditorThemes, setupMonaco } from './monacoSetup';
import { getOrCreateModel, replaceModelText } from './editorModels';

export interface UseMonacoEditorOptions {
  modelKey: string;
  language: 'sql' | 'json';
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  markers?: PgErrorInfo[];
  onCursor?: (pos: { line: number; col: number }) => void;
  /** Extra options merged into the editor construction options. */
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

const BASE_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: MONO_FONT,
  fontSize: 13,
  lineHeight: 20,
  lineNumbers: 'on',
  minimap: { enabled: false },
  wordWrap: 'off',
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  bracketPairColorization: { enabled: true },
  automaticLayout: true,
  tabSize: 2,
  padding: { top: 8, bottom: 8 },
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  fixedOverflowWidgets: true,
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  contextmenu: false
};

/** Length of the identifier/token starting at (line, col), so error markers underline something visible. */
function tokenLengthAt(model: monaco.editor.ITextModel, line: number, col: number): number {
  const text = model.getLineContent(line).slice(col - 1);
  const m = /^("(?:[^"]|"")+"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_$]*|\d+(\.\d+)?|\S)/.exec(text);
  return Math.max(1, m ? m[0].length : 1);
}

export function toMonacoMarkers(model: monaco.editor.ITextModel, errors: PgErrorInfo[]): monaco.editor.IMarkerData[] {
  const out: monaco.editor.IMarkerData[] = [];
  for (const e of errors) {
    const line = Math.min(Math.max(1, e.line ?? 1), model.getLineCount());
    const col = Math.max(1, e.col ?? 1);
    const len = tokenLengthAt(model, line, col);
    const parts = [e.message, e.detail, e.hint ? `Hint: ${e.hint}` : undefined].filter(Boolean);
    out.push({
      severity: monaco.MarkerSeverity.Error,
      message: parts.join('\n'),
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: col + len,
      ...(e.code ? { code: e.code } : {})
    });
  }
  return out;
}

/**
 * Creates one Monaco editor bound to a persistent model. Text is pushed in only when the editor is not focused,
 * so nothing ever rewrites what the user is typing; changes flow out debounced (150 ms).
 */
export function useMonacoEditor(opts: UseMonacoEditorOptions): {
  containerRef: React.RefObject<HTMLDivElement>;
  editor: monaco.editor.IStandaloneCodeEditor | null;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(opts.onChange);
  const onCursorRef = useRef(opts.onCursor);
  onChangeRef.current = opts.onChange;
  onCursorRef.current = opts.onCursor;
  const { resolved } = useTheme();
  const themeName = resolved === 'dark' ? 'pgui-dark' : 'pgui-light';

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setupMonaco();
    const model = getOrCreateModel(opts.modelKey, opts.language, opts.value);
    const ed = monaco.editor.create(el, {
      ...BASE_OPTIONS,
      ...opts.options,
      model,
      readOnly: opts.readOnly ?? false,
      theme: themeName
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subs: monaco.IDisposable[] = [
      ed.onDidChangeModelContent(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => onChangeRef.current?.(model.getValue()), 150);
      }),
      ed.onDidChangeCursorPosition((e) => onCursorRef.current?.({ line: e.position.lineNumber, col: e.position.column }))
    ];
    setEditor(ed);
    return () => {
      if (timer) {
        clearTimeout(timer);
        onChangeRef.current?.(model.getValue());
      }
      for (const s of subs) s.dispose();
      ed.dispose();
      setEditor(null);
    };
    // The editor is created once per model key; other props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.modelKey, opts.language]);

  // External value changes (restore, format, "open in query tab") — never while the user is typing.
  useEffect(() => {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    if (model.getValue() !== opts.value && !editor.hasTextFocus()) replaceModelText(model, opts.value);
  }, [editor, opts.value]);

  useEffect(() => {
    editor?.updateOptions({ readOnly: opts.readOnly ?? false });
  }, [editor, opts.readOnly]);

  useEffect(() => {
    if (!editor) return;
    defineEditorThemes();
    monaco.editor.setTheme(themeName);
  }, [editor, themeName]);

  useEffect(() => {
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'pgui', toMonacoMarkers(model, opts.markers ?? []));
  }, [editor, opts.markers]);

  return { containerRef, editor };
}
