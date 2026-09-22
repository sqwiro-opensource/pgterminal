/**
 * Text models outlive editor instances: a query tab's model persists while the tab is hidden so switching tabs
 * never rewrites the user's text or loses undo history.
 */
import { monaco, JSON_LANGUAGE, SQL_LANGUAGE } from './monacoSetup';
import { modelUriString } from './editorRegistry';

const models = new Map<string, monaco.editor.ITextModel>();

export function getOrCreateModel(modelKey: string, language: 'sql' | 'json', initialValue: string): monaco.editor.ITextModel {
  const existing = models.get(modelKey);
  if (existing && !existing.isDisposed()) return existing;
  const uri = monaco.Uri.parse(modelUriString(modelKey, language));
  const stale = monaco.editor.getModel(uri);
  if (stale) stale.dispose();
  const model = monaco.editor.createModel(initialValue, language === 'sql' ? SQL_LANGUAGE : JSON_LANGUAGE, uri);
  models.set(modelKey, model);
  return model;
}

/** Replace the whole text while keeping the undo stack (unlike `setValue`). */
export function replaceModelText(model: monaco.editor.ITextModel, text: string): void {
  if (model.getValue() === text) return;
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
}

export function disposeEditorModel(modelKey: string): void {
  const m = models.get(modelKey);
  models.delete(modelKey);
  if (m && !m.isDisposed()) m.dispose();
}

export function hasEditorModel(modelKey: string): boolean {
  const m = models.get(modelKey);
  return !!m && !m.isDisposed();
}
