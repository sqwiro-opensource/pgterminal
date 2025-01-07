import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { cn } from '@src/renderer/utils/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { MdiBolt } from '@cloudhub-ux-icons/mdi';
import { createTriggerSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator';
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/context-menu';

function TableTriggersTree({ schema, tableName }: { schema: string; tableName: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext();

  const { openNewTab } = useTabInterfaceContext();

  const showCreateSql = async (item: { triggerName: string }) => {
    const createTriggerSql = createTriggerSqlScript(schema, tableName, item.triggerName);

    const { data, error, timeCost, successMessage } = await dbQuery(createTriggerSql);

    const tabId = `create_trigger_sql/${item.triggerName}`;

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
      title: `Trigger SQL: ${item.triggerName}`,
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

  const triggers = schemas[schema].tables.tableList[tableName].triggers.triggerList;

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(triggers || {}).map((item) => (
          <li key={item.triggerName}>
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
                    <span className="ml-2">{item.triggerName}</span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => showCreateSql(item)}>
                    SQL: Create
                  </ContextMenuItem>

                  <ContextMenuItem
                    onSelect={async () => {
                      openNewTab({
                        id: `drop/${schema}_${item.triggerName}`,
                        title: `Drop SQL: ${schema}.${item.triggerName}`,
                        type: 'query',
                        queryState: {
                          query: `
                          DROP TRIGGER IF EXISTS "${item.triggerName}" ON ${schema}."${tableName}";`
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: (
                          <QueryComponent tabId={`drop/${schema}_${item.triggerName}`} />
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

export default TableTriggersTree;
