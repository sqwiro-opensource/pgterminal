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

export default function MonacoSqlEditor({ ...props }: EditorProps) {
  const monacoRef = React.useRef<any>(null);
  const { themeMode } = useMuiThemeContext();

  const { schemas } = useSelectedDatabaseContext();

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;

    // Register SQL language features
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (
        model,
        position,
        context,
        token
      ): {
        suggestions: Array<{
          label: string;
          kind: monaco.languages.CompletionItemKind;
          insertText: string;
          detail: string;
        }>;
      } => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        const wordRange = { ...range };

        const lineContent = model.getLineContent(position.lineNumber);
        const textUntilPosition = lineContent.substring(0, position.column - 1);
        const fullText = model.getValue();

        // Function to extract table name from a reference
        const getTableFromReference = (tableRef: string): string | null => {
          if (tableRef.includes('.')) {
            return tableRef;
          }

          const aliasPattern = new RegExp(
            `(FROM|JOIN)\\s+(\\w+\\.)?\\w+\\s+(?:AS\\s+)?${tableRef}\\b`,
            'i'
          );
          const aliasMatch = fullText.match(aliasPattern);
          if (aliasMatch) {
            const clauseParts = aliasMatch[0].split(/\s+/);
            return clauseParts[1];
          }

          return null;
        };

        // Check if we're after a table reference and dot
        const tableRefMatch = textUntilPosition.match(/(\w+)\.\s*$/);
        if (tableRefMatch) {
          const tableRef = tableRefMatch[1];
          const actualTable = getTableFromReference(tableRef);

          if (actualTable) {
            const [schemaName, tableName] = actualTable.split('.');
            const schema = schemas[schemaName];
            const table = schema?.tables.tableList[tableName];

            if (table) {
              return {
                suggestions: Object.values(table.columns.columnList).map((column) => ({
                  label: column.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  detail: `Column (${column.dataType})`,
                  documentation: {
                    value: [
                      `**${column.name}**`,
                      `Type: ${column.dataType}`,
                      `Nullable: ${column.isNullable ? 'Yes' : 'No'}`,
                      column.isPrimaryKey ? '🔑 Primary Key' : '',
                      column.isUnique ? '🎯 Unique' : '',
                      column.isForeignKey ? '🔗 Foreign Key' : '',
                      column.defaultValue ? `Default: ${column.defaultValue}` : ''
                    ]
                      .filter(Boolean)
                      .join('\n')
                  },
                  insertText: column.name,
                  range
                }))
              };
            }
          }
        }

        // Get all referenced tables in the current query
        const fromClausePattern = /FROM\s+(\w+\.\w+)(?:\s+(?:AS\s+)?(\w+))?/gi;
        const joinClausePattern = /JOIN\s+(\w+\.\w+)(?:\s+(?:AS\s+)?(\w+))?/gi;
        const referencedTables = new Map<string, string>(); // alias -> full table name

        let match;
        while ((match = fromClausePattern.exec(fullText)) !== null) {
          referencedTables.set(match[1], match[1]); // full name -> full name
          if (match[2]) referencedTables.set(match[2], match[1]); // alias -> full name
        }
        while ((match = joinClausePattern.exec(fullText)) !== null) {
          referencedTables.set(match[1], match[1]); // full name -> full name
          if (match[2]) referencedTables.set(match[2], match[1]); // alias -> full name
        }

        // If we're in a WHERE, SELECT, or HAVING clause, suggest columns from all referenced tables
        const inColumnContext =
          /(?:SELECT|WHERE|HAVING|ON|AND|OR|GROUP BY|ORDER BY)\s+[^;]*$/i.test(textUntilPosition);
        if (inColumnContext) {
          const columnSuggestions: monaco.languages.CompletionItem[] = [];

          for (const [alias, fullTableRef] of referencedTables.entries()) {
            const [schemaName, tableName] = fullTableRef.split('.');
            const schema = schemas[schemaName];
            const table = schema?.tables.tableList[tableName];

            if (table) {
              columnSuggestions.push(
                ...Object.values(table.columns.columnList).map((column) => ({
                  label: `${alias}.${column.name}`,
                  kind: monaco.languages.CompletionItemKind.Field,
                  detail: `Column from ${fullTableRef} (${column.dataType})`,
                  documentation: {
                    value: [
                      `**${column.name}**`,
                      `Table: ${fullTableRef}`,
                      `Type: ${column.dataType}`,
                      `Nullable: ${column.isNullable ? 'Yes' : 'No'}`,
                      column.isPrimaryKey ? '🔑 Primary Key' : '',
                      column.isUnique ? '🎯 Unique' : '',
                      column.isForeignKey ? '🔗 Foreign Key' : '',
                      column.defaultValue ? `Default: ${column.defaultValue}` : ''
                    ]
                      .filter(Boolean)
                      .join('\n')
                  },
                  insertText: `"${column.name}"`,
                  range
                }))
              );
            }
          }

          if (columnSuggestions.length > 0) {
            return { suggestions: columnSuggestions };
          }
        }

        // Suggest schema.table combinations when after FROM or JOIN
        const afterTableKeyword = textUntilPosition.match(/\b(FROM|JOIN|UPDATE|INTO)\s+$/i);

        if (afterTableKeyword) {
          const tableSuggestions: monaco.languages.CompletionItem[] = [];

          for (const [schemaName, schema] of Object.entries(schemas)) {
            for (const [tableName, table] of Object.entries(schema.tables.tableList)) {
              tableSuggestions.push({
                label: `${schemaName}.${tableName}`,
                kind: monaco.languages.CompletionItemKind.Class,
                detail: `Table in ${schemaName} schema`,
                documentation: {
                  value: `Columns: ${Object.values(table.columns.columnList)
                    .map((col) => col.name)
                    .join(', ')}`
                },
                insertText: `${schemaName}.${tableName}`,
                range
              });
            }
          }

          return { suggestions: tableSuggestions };
        }

        return {
          suggestions: [
            // SQL Keywords
            ...POSTGRES_KEYWORDS.map((keyword) => ({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: keyword,
              detail: 'SQL Keyword',
              range: wordRange
            })),

            // Common SQL Functions
            ...POSTGRES_FUNCTIONS.map((func) => ({
              label: func.label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: func.insertText,
              detail: func.detail,
              documentation: {
                value: func.documentation
              },
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: wordRange
            })),

            // Data Types
            ...POSTGRES_TYPES.map((type) => ({
              label: type,
              kind: monaco.languages.CompletionItemKind.TypeParameter,
              insertText: type,
              detail: 'PostgreSQL Data Type',
              range: wordRange
            })),

            // Snippets
            ...POSTGRES_SNIPPETS.map((snippet) => ({
              label: snippet.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: snippet.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: snippet.detail,
              documentation: {
                value: `Template for creating a ${snippet.label.toLowerCase()}`
              },
              range: wordRange
            })),

            ...Object.values(schemas || {}).flatMap((schema) =>
              Object.values(schema.tables.tableList || {}).map((table) => ({
                label: `${schema.schemaName}.${table.tableName}`,
                kind: monaco.languages.CompletionItemKind.Class,
                detail: `Table with columns: ${Object.values(table.columns.columnList || {})
                  .map((c) => c.name)
                  .join(', ')}`,
                insertText: `${schema.schemaName}.${table.tableName}`,
                range: wordRange
              }))
            )
          ]
        } as any;
      }
    });

    // SQL syntax highlighting rules remain unchanged
    monaco.languages.setMonarchTokensProvider('sql', {
      defaultToken: '',
      tokenPostfix: '.sql',
      ignoreCase: true,

      keywords: [
        'SELECT',
        'FROM',
        'WHERE',
        'INSERT',
        'UPDATE',
        'DELETE',
        'JOIN',
        'LEFT',
        'RIGHT',
        'INNER',
        'GROUP',
        'BY',
        'ORDER',
        'HAVING',
        'LIMIT',
        'OFFSET',
        'AND',
        'OR',
        'IN',
        'NOT',
        'NULL',
        'IS',
        'LIKE',
        'BETWEEN',
        'ASC',
        'DESC'
      ],

      operators: ['=', '>', '<', '>=', '<=', '<>', '!=', '+', '-', '*', '/'],

      brackets: [{ open: '(', close: ')', token: 'delimiter.parenthesis' }],

      tokenizer: {
        root: [
          { include: '@whitespace' },
          { include: '@numbers' },
          { include: '@strings' },
          { include: '@comments' },

          [/[;,.]/, 'delimiter'],
          [/[()]/, '@brackets'],
          [
            /[\w@#$]+/,
            {
              cases: {
                '@keywords': 'keyword',
                '@operators': 'operator',
                '@default': 'identifier'
              }
            }
          ]
        ],

        whitespace: [[/\s+/, 'white']],

        comments: [
          [/--+.*/, 'comment'],
          [/\/\*/, { token: 'comment.quote', next: '@comment' }]
        ],

        comment: [
          [/[^*/]+/, 'comment'],
          [/\*\//, { token: 'comment.quote', next: '@pop' }],
          [/./, 'comment']
        ],

        numbers: [
          [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
          [/\d+/, 'number']
        ],

        strings: [[/'/, { token: 'string', next: '@string' }]],

        string: [
          [/[^']+/, 'string'],
          [/''/, 'string'],
          [/'/, { token: 'string', next: '@pop' }]
        ]
      }
    });
  };

  return (
    <Block absolute>
      <Editor
        defaultLanguage="sql"
        className="flex-1"
        theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
        beforeMount={handleBeforeMount}
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
          }
        }}
        {...props}
      />
    </Block>
  );
}
