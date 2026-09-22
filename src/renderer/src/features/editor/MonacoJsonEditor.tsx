import { useEffect } from 'react';
import type { PgErrorInfo } from '@shared/types/query';
import type { monaco } from './monacoSetup';
import { useMonacoEditor } from './useMonacoEditor';

export interface MonacoJsonEditorProps {
  modelKey: string;
  value: string;
  onChange?(value: string): void;
  readOnly?: boolean;
  markers?: PgErrorInfo[];
  className?: string;
  /** Called once the editor instance exists (decorations, commands). */
  onMount?(editor: monaco.editor.IStandaloneCodeEditor): void;
}

/** JSON editor sharing the SQL editor's model registry, theme and options (document tab, jsonb cells). */
export function MonacoJsonEditor(props: MonacoJsonEditorProps): JSX.Element {
  const { containerRef, editor } = useMonacoEditor({
    modelKey: props.modelKey,
    language: 'json',
    value: props.value,
    ...(props.onChange ? { onChange: props.onChange } : {}),
    ...(props.readOnly !== undefined ? { readOnly: props.readOnly } : {}),
    ...(props.markers ? { markers: props.markers } : {}),
    options: { wordWrap: 'on', lineNumbers: 'on' }
  });
  useEffect(() => {
    if (editor) props.onMount?.(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  return <div ref={containerRef} className={props.className ?? 'h-full w-full min-h-0'} />;
}

export default MonacoJsonEditor;
