import React from 'react';

import Editor, { BeforeMount, EditorProps, loader } from '@monaco-editor/react';

import * as monaco from 'monaco-editor';
import {
  POSTGRES_FUNCTIONS,
  POSTGRES_KEYWORDS,
  POSTGRES_SNIPPETS,
  POSTGRES_TYPES
} from '@src/renderer/app/components/editor/completion';
import { Block, useMuiThemeContext } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { BlockProps } from '@cloudhub-ux/mui/dist/Block';

loader.config({ monaco });

interface DBSchema {
  schema: string;
  tables: {
    name: string;
    columns: Array<{
      name: string;
      type: string;
    }>;
  }[];
}

export default function MonacoJsonEditor({
  options,
  containerProps = {},
  ...props
}: EditorProps & { containerProps?: BlockProps }) {
  const monacoRef = React.useRef<any>(null);
  const editorRef = React.useRef<any>(null);
  const { openDocumentTab } = useTabInterfaceContext();
  const { themeMode } = useMuiThemeContext();

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;

    // Register the link provider
    monaco.languages.registerLinkProvider('json', {
      provideLinks: (model) => {
        const links: monaco.languages.ILink[] = [];
        const text = model.getValue();
        const pattern = /("(?:_id|_ref)"\s*:\s*")([^"]*)"/g;

        let match;
        while ((match = pattern.exec(text)) !== null) {
          const valueStartIndex = match.index + match[1].length;
          const value = match[2];

          const startPosition = model.getPositionAt(valueStartIndex);
          const endPosition = model.getPositionAt(valueStartIndex + value.length);

          links.push({
            range: {
              startLineNumber: startPosition.lineNumber,
              startColumn: startPosition.column,
              endLineNumber: endPosition.lineNumber,
              endColumn: endPosition.column
            },
            url: '#',
            tooltip: `Open document ${value}`
          });
        }

        return { links };
      }
    });
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Add click handler for links
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
        const model = editor.getModel();
        const position = e.target.position;

        // Check if click is on a link
        const text = model.getValue();
        const pattern = /("(?:_id|_ref)"\s*:\s*")([^"]*)"/g;

        let match;
        while ((match = pattern.exec(text)) !== null) {
          const valueStartIndex = match.index + match[1].length;
          const value = match[2];

          const startPosition = model.getPositionAt(valueStartIndex);
          const endPosition = model.getPositionAt(valueStartIndex + value.length);

          if (
            position.lineNumber === startPosition.lineNumber &&
            position.column >= startPosition.column &&
            position.column <= endPosition.column
          ) {
            // Handle link click
            // console.log('Clicked on ID:', value);
            // Add your navigation logic here

            if (`${value}`.includes('/')) {
              const [tableName, document_id] = value.split('/');

              if (`${tableName}`.includes('_')) {
                const [schema, schema_tableName] = tableName.split('_');
                openDocumentTab({
                  schema,
                  tableName,
                  pk: '_id',
                  value,
                  document: {}
                });
              }
            }

            break;
          }
        }
      }
    });

    // Add decorations for links
    const updateDecorations = () => {
      const model = editor.getModel();
      const text = model.getValue();
      const pattern = /("(?:_id|_ref)"\s*:\s*")([^"]*)"/g;
      const decorations: monaco.editor.IModelDeltaDecoration[] = [];

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const valueStartIndex = match.index + match[1].length;
        const value = match[2];

        const startPosition = model.getPositionAt(valueStartIndex);
        const endPosition = model.getPositionAt(valueStartIndex + value.length);

        decorations.push({
          range: {
            startLineNumber: startPosition.lineNumber,
            startColumn: startPosition.column,
            endLineNumber: endPosition.lineNumber,
            endColumn: endPosition.column
          },
          options: {
            inlineClassName: 'monaco-json-link',
            hoverMessage: { value: 'Click to navigate' }
          }
        });
      }

      editor.deltaDecorations([], decorations);
    };

    // Update decorations on content change
    editor.onDidChangeModelContent(() => {
      updateDecorations();
    });

    // Initial decoration
    updateDecorations();

    // Call the original onMount if provided
    if (props.onMount) {
      props.onMount(editor, monaco);
    }
  };

  return (
    <Block
      absolute
      sx={{
        '& .monaco-json-link': {
          textDecoration: 'underline',
          color: '#0066cc',
          cursor: 'pointer'
        }
      }}
      {...containerProps}
    >
      <Editor
        defaultLanguage="json"
        className="flex-1"
        theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          wordBasedSuggestions: 'matchingDocuments',
          tabCompletion: 'on',
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showClasses: true,
            showFunctions: true,
            showVariables: true
          },
          ...options
        }}
        {...props}
      />
    </Block>
  );
}
