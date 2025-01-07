import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { cn } from '@src/renderer/utils/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { MdiBolt } from '@cloudhub-ux-icons/mdi';
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/context-menu';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { createRelationSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator';

function TableRelationsTree({ schema, tableName }: { schema: string; tableName: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext();

  const { openNewTab } = useTabInterfaceContext();

  const showCreateSql = async (item: { relationName: string }) => {
    const createTriggerSql = createRelationSqlScript(schema, tableName, item.relationName);

    const { data, error, timeCost, successMessage } = await dbQuery(createTriggerSql);

    const tabId = `create_relation_sql/${item.relationName}`;

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
      title: `Relation SQL: ${item.relationName}`,
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

  const relations = schemas[schema].tables.tableList[tableName].relations.relationList;

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(relations || {}).map((item) => (
          <li key={item.relationName}>
            <div className="flex items-center">
              <ContextMenu>
                <ContextMenuTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 hover:bg-muted')}
                    onDoubleClick={() => showCreateSql(item)}
                  >
                    <MdiBolt size={16} color="orange" className="h-4 w-4 shrink-0 mr-1" />
                    <span className="ml-2">{item.relationName}</span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => showCreateSql(item)}>
                    SQL: Create
                  </ContextMenuItem>

                  <ContextMenuItem
                    onSelect={async () => {
                      openNewTab({
                        id: `drop/${schema}_${item.relationName}`,
                        title: `Drop SQL: ${schema}.${item.relationName}`,
                        type: 'query',
                        queryState: {
                          query: `
                          DROP TRIGGER IF EXISTS "${item.relationName}" ON ${schema}."${tableName}";`
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: (
                          <QueryComponent tabId={`drop/${schema}_${item.relationName}`} />
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

export default TableRelationsTree;
