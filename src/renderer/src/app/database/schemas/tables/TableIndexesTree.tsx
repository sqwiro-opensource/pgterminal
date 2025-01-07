import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { cn } from '@src/renderer/utils/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { MdiKeyAlertOutline } from '@cloudhub-ux-icons/mdi';
import { colors } from '@src/renderer/theme';
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { createIndexSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/context-menu';

function TableIndexesTree({ schema, tableName }: { schema: string; tableName: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext();
  const { openNewTab } = useTabInterfaceContext();

  const showCreateSql = async (item: { indexName: string }) => {
    const createIndexSql = createIndexSqlScript(schema, tableName, item.indexName);
    const { data, error, timeCost, successMessage } = await dbQuery(createIndexSql);

    const tabId = `create_index_sql/${item.indexName}`;

    if (data || error || successMessage) {
      dispatch((state) => ({
        tabInterfaceContext: {
          ...state.tabInterfaceContext,
          tabs: {
            ...state.tabInterfaceContext.tabs,
            [tabId]: {
              ...(state.tabInterfaceContext.tabs[tabId] || {}),
              queryState: {
                query: typeof data === 'string' ? data : '',
                error: error || '',
                timeCost: timeCost || 0,
                successMessage: successMessage || ''
              }
            }
          }
        }
      }));
    }

    openNewTab({
      id: tabId,
      title: `Index SQL: ${item.indexName}`,
      type: 'query',
      queryState: {
        query: typeof data === 'string' ? data : ''
      },
      resultsState: {
        data: []
      },
      queryComponent: <QueryComponent tabId={tabId} />,
      resultsComponent: null
    });
  };

  if (!schema || !tableName) {
    return null;
  }
  const level = 1;

  const indexes = schemas[schema].tables.tableList[tableName].indexes.indexList;

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(indexes || {}).map((item) => (
          <li key={item.indexName}>
            <div className="flex items-center">
              <ContextMenu>
                <ContextMenuTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 hover:bg-muted')}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      showCreateSql(item);
                    }}
                  >
                    <MdiKeyAlertOutline
                      size={16}
                      color={colors.red[300]}
                      className="h-4 w-4 shrink-0 mr-1"
                    />
                    <span className="ml-2">{item.indexName}</span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => showCreateSql(item)}>
                    SQL: Create
                  </ContextMenuItem>

                  <ContextMenuItem
                    onSelect={async () => {
                      openNewTab({
                        id: `drop/${schema}_${item.indexName}`,
                        title: `Drop SQL: ${schema}.${item.indexName}`,
                        type: 'query',
                        queryState: {
                          query: `
                          ALTER TABLE ${schema}."${tableName}"
                          DROP CONSTRAINT IF EXISTS "${item.indexName}";


                          DROP INDEX IF EXISTS ${schema}."${item.indexName}"`
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: (
                          <QueryComponent tabId={`drop/${schema}_${item.indexName}`} />
                        ),
                        resultsComponent: null
                      });
                    }}
                  >
                    Drop
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          </li>
        ))}
      </ul>
    </Block>
  );
}

export default TableIndexesTree;
