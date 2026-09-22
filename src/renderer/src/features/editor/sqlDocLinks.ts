/**
 * Monaco link provider for SQL models: `'sales_customer/42'` string literals become `pgterminal-doc://` links so a
 * WHERE clause literal is navigable like a grid cell. Registered once from `setupMonaco()`.
 */
import { monaco, SQL_LANGUAGE } from './monacoSetup';
import { getEditorContext, modelKeyFromUri } from './editorRegistry';
import { collectLinks } from './jsonDocLinks';

const SQL_STRING = /'(?:[^']|'')*'/g;

function unescapeSql(token: string): string | null {
  const inner = token.slice(1, -1).replace(/''/g, "'");
  return inner.length > 0 ? inner : null;
}

export function registerSqlDocLinks(): monaco.IDisposable {
  return monaco.languages.registerLinkProvider(SQL_LANGUAGE, {
    provideLinks(model) {
      const key = modelKeyFromUri(model.uri.toString());
      const ctx = key ? getEditorContext(key) : undefined;
      if (!ctx) return { links: [] };
      return { links: collectLinks(model, SQL_STRING, unescapeSql, ctx) };
    }
  });
}
