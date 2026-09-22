/**
 * Monaco link provider for JSON models: every string token that parses as a document reference and resolves in
 * the editor's database becomes a `pgui-doc://` link (⌘-click / F12 opens it through the shared opener).
 * Registered once from `setupMonaco()`.
 */
import { parseDocRef } from '@shared/doclink/parseDocRef';
import { monaco, JSON_LANGUAGE } from './monacoSetup';
import { getEditorContext, linkResolver, modelKeyFromUri } from './editorRegistry';
import { docLinkUrl } from './docLinkUrl';

export { docLinkUrl };

const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;

function unescapeJson(token: string): string | null {
  try {
    return JSON.parse(token) as string;
  } catch {
    return null;
  }
}

export function collectLinks(
  model: monaco.editor.ITextModel,
  pattern: RegExp,
  unescape: (token: string) => string | null,
  ctx: { connectionId: string; database: string; tabId?: string }
): monaco.languages.ILink[] {
  const text = model.getValue();
  const links: monaco.languages.ILink[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    const token = m[0];
    const raw = unescape(token);
    if (!raw || !parseDocRef(raw) || !linkResolver.isResolvable(raw, ctx.connectionId, ctx.database)) continue;
    const start = model.getPositionAt(m.index + 1);
    const end = model.getPositionAt(m.index + token.length - 1);
    links.push({
      range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
      url: docLinkUrl(raw, ctx),
      tooltip: `${raw} — ⌘-click to open document`
    });
    if (links.length >= 2000) break;
  }
  return links;
}

export function registerJsonDocLinks(): monaco.IDisposable {
  const links = monaco.languages.registerLinkProvider(JSON_LANGUAGE, {
    provideLinks(model) {
      const key = modelKeyFromUri(model.uri.toString());
      const ctx = key ? getEditorContext(key) : undefined;
      if (!ctx) return { links: [] };
      return { links: collectLinks(model, JSON_STRING, unescapeJson, ctx) };
    }
  });
  const hover = monaco.languages.registerHoverProvider(JSON_LANGUAGE, {
    provideHover(model, position) {
      const key = modelKeyFromUri(model.uri.toString());
      const ctx = key ? getEditorContext(key) : undefined;
      if (!ctx) return null;
      const line = model.getLineContent(position.lineNumber);
      const re = new RegExp(JSON_STRING.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const s = m.index + 1;
        const e = m.index + m[0].length + 1;
        if (position.column < s || position.column > e) continue;
        const raw = unescapeJson(m[0]);
        const ref = raw ? parseDocRef(raw) : null;
        if (!ref) return null;
        return {
          range: new monaco.Range(position.lineNumber, s, position.lineNumber, e),
          contents: [{ value: `**${ref.table}** / ${ref.key} · ⌘-click to open document` }]
        };
      }
      return null;
    }
  });
  return {
    dispose() {
      links.dispose();
      hover.dispose();
    }
  };
}
