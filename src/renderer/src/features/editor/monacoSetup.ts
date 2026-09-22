/**
 * One-time Monaco wiring: workers (Vite `?worker`, CSP-safe), the built-in pgsql tokenizer, app themes derived
 * from the CSS tokens, and exactly ONE registration each of the completion, hover and link-opener providers.
 * Every editor instance shares these; per-editor state lives in editorRegistry.ts.
 */
import 'monaco-editor/esm/vs/editor/editor.all';
import 'monaco-editor/esm/vs/basic-languages/pgsql/pgsql.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { analyzeSqlContext } from './sqlContext';
import { buildCompletions, lookupColumnType, type CompletionItem } from './sqlCompletion';
import { editorHooks, getEditorIndex, modelKeyFromUri } from './editorRegistry';
import { registerJsonDocLinks } from './jsonDocLinks';
import { registerSqlDocLinks } from './sqlDocLinks';

export { monaco };

export const SQL_LANGUAGE = 'pgsql';
export const JSON_LANGUAGE = 'json';
export const MONO_FONT = '"JetBrains Mono", "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace';

let installed: monaco.IDisposable | null = null;

/** HSL triplet token (`222 14% 9%`) → `#rrggbb`. */
export function hslTokenToHex(token: string, fallback: string): string {
  const m = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(token);
  if (!m) return fallback;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

/** (Re)define `pgui-light`/`pgui-dark` from the current CSS tokens. Safe to call repeatedly. */
export function defineEditorThemes(): void {
  const t = (name: string, fb: string): string => hslTokenToHex(cssVar(name), fb);
  const build = (dark: boolean): monaco.editor.IStandaloneThemeData => ({
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: t('--primary', dark ? '7c9cff' : '2f4fc7').slice(1), fontStyle: 'bold' },
      { token: 'keyword.sql', foreground: t('--primary', dark ? '7c9cff' : '2f4fc7').slice(1), fontStyle: 'bold' },
      { token: 'operator.sql', foreground: t('--muted-foreground', dark ? '9aa3b2' : '6b7280').slice(1) },
      { token: 'string', foreground: t('--str', dark ? '7fd3a0' : '2c7a4b').slice(1) },
      { token: 'string.sql', foreground: t('--str', dark ? '7fd3a0' : '2c7a4b').slice(1) },
      { token: 'number', foreground: t('--num', dark ? '7cb3f0' : '0b5cad').slice(1) },
      { token: 'comment', foreground: t('--muted-foreground', dark ? '9aa3b2' : '6b7280').slice(1), fontStyle: 'italic' },
      { token: 'predefined.sql', foreground: t('--time', dark ? 'c9a3ea' : '7c3aad').slice(1) },
      { token: 'identifier', foreground: t('--foreground', dark ? 'e6e9ef' : '1b1f2a').slice(1) },
      { token: 'string.key.json', foreground: t('--muted-foreground', dark ? '9aa3b2' : '6b7280').slice(1) },
      { token: 'string.value.json', foreground: t('--str', dark ? '7fd3a0' : '2c7a4b').slice(1) },
      { token: 'number.json', foreground: t('--num', dark ? '7cb3f0' : '0b5cad').slice(1) },
      { token: 'keyword.json', foreground: t('--bool', dark ? '86d19a' : '2e7d4f').slice(1) }
    ],
    colors: {
      'editor.background': t('--background', dark ? '#0f1116' : '#ffffff'),
      'editor.foreground': t('--foreground', dark ? '#e6e9ef' : '#1b1f2a'),
      'editorLineNumber.foreground': t('--muted-foreground', dark ? '#9aa3b2' : '#6b7280') + '99',
      'editorLineNumber.activeForeground': t('--foreground', dark ? '#e6e9ef' : '#1b1f2a'),
      'editor.lineHighlightBackground': t('--accent', dark ? '#262a35' : '#eceff3') + '80',
      'editor.selectionBackground': t('--primary', dark ? '#7c9cff' : '#2f4fc7') + '40',
      'editor.inactiveSelectionBackground': t('--primary', dark ? '#7c9cff' : '#2f4fc7') + '22',
      'editorCursor.foreground': t('--foreground', dark ? '#e6e9ef' : '#1b1f2a'),
      'editorWidget.background': t('--popover', dark ? '#171a21' : '#ffffff'),
      'editorWidget.border': t('--border', dark ? '#2b3040' : '#e2e5ea'),
      'editorSuggestWidget.background': t('--popover', dark ? '#171a21' : '#ffffff'),
      'editorSuggestWidget.border': t('--border', dark ? '#2b3040' : '#e2e5ea'),
      'editorSuggestWidget.selectedBackground': t('--accent', dark ? '#262a35' : '#eceff3'),
      'editorHoverWidget.background': t('--popover', dark ? '#171a21' : '#ffffff'),
      'editorHoverWidget.border': t('--border', dark ? '#2b3040' : '#e2e5ea'),
      'editorIndentGuide.background': t('--grid-line', dark ? '#242836' : '#e8ebef'),
      'editorGutter.background': t('--background', dark ? '#0f1116' : '#ffffff'),
      'scrollbarSlider.background': t('--muted-foreground', dark ? '#9aa3b2' : '#6b7280') + '55'
    }
  });
  monaco.editor.defineTheme('pgui-light', build(false));
  monaco.editor.defineTheme('pgui-dark', build(true));
}

const KIND_MAP: Record<CompletionItem['kind'], monaco.languages.CompletionItemKind> = {
  schema: monaco.languages.CompletionItemKind.Module,
  table: monaco.languages.CompletionItemKind.Class,
  view: monaco.languages.CompletionItemKind.Interface,
  column: monaco.languages.CompletionItemKind.Field,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  function: monaco.languages.CompletionItemKind.Function,
  snippet: monaco.languages.CompletionItemKind.Snippet,
  type: monaco.languages.CompletionItemKind.TypeParameter
};

function wordRange(model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange {
  const w = model.getWordUntilPosition(position);
  return { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
}

function registerCompletionProvider(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(SQL_LANGUAGE, {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const key = modelKeyFromUri(model.uri.toString());
      const index = key ? getEditorIndex(key) : undefined;
      const text = model.getValue();
      const ctx = analyzeSqlContext(text, model.getOffsetAt(position));
      const range = wordRange(model, position);
      const suggestions = buildCompletions(ctx, index).map((item): monaco.languages.CompletionItem => {
        const s: monaco.languages.CompletionItem = {
          label: item.label,
          kind: KIND_MAP[item.kind],
          insertText: item.insertText,
          sortText: item.sortText,
          range
        };
        if (item.detail) s.detail = item.detail;
        if (item.documentation) s.documentation = item.documentation;
        if (item.isSnippet) s.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
        return s;
      });
      return { suggestions };
    }
  });
}

function registerHoverProvider(): monaco.IDisposable {
  return monaco.languages.registerHoverProvider(SQL_LANGUAGE, {
    provideHover(model, position) {
      const key = modelKeyFromUri(model.uri.toString());
      const index = key ? getEditorIndex(key) : undefined;
      if (!index) return null;
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const offset = model.getOffsetAt(position);
      const ctx = analyzeSqlContext(model.getValue(), offset);
      const line = model.getLineContent(position.lineNumber);
      const beforeWord = line.slice(0, word.startColumn - 1);
      const qm = /([A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+")\.$/.exec(beforeWord);
      const qualifier = qm && qm[1] ? qm[1].replace(/^"|"$/g, '').replace(/""/g, '"') : undefined;
      const type = lookupColumnType(ctx, index, word.word, qualifier);
      if (!type) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: `**${word.word}** · ${type}` }]
      };
    }
  });
}

function registerLinkOpener(): monaco.IDisposable {
  return monaco.editor.registerLinkOpener({
    open(resource) {
      if (resource.scheme !== 'pgui-doc') return false;
      editorHooks.onOpenDocLink?.(resource.toString());
      return true;
    }
  });
}

/**
 * Install workers, themes and providers exactly once. Returns the composite disposable; disposing it allows a
 * later `setupMonaco()` to register again (used by HMR).
 */
let docLinkParts: monaco.IDisposable[] = [];

/**
 * Re-registers the document-link providers so Monaco recomputes links for open models.
 *
 * Link results are cached per model and only recomputed on content change, but whether a
 * reference resolves depends on the catalog index, which loads asynchronously. Without this,
 * an editor opened before its index arrives shows no links until the text is edited.
 */
export function refreshDocLinks(): void {
  if (!installed) return;
  for (const p of docLinkParts) p.dispose();
  docLinkParts = [registerJsonDocLinks(), registerSqlDocLinks()];
}

export function setupMonaco(): monaco.IDisposable {
  if (installed) return installed;
  const env = self as unknown as { MonacoEnvironment?: monaco.Environment };
  env.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === 'json') return new JsonWorker();
      return new EditorWorker();
    }
  };
  defineEditorThemes();
  const parts = [registerCompletionProvider(), registerHoverProvider(), registerLinkOpener()];
  docLinkParts = [registerJsonDocLinks(), registerSqlDocLinks()];
  installed = {
    dispose() {
      for (const p of [...parts, ...docLinkParts]) p.dispose();
      installed = null;
    }
  };
  return installed;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => installed?.dispose());
}
