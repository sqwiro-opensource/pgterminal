import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { cn } from '@src/renderer/utils/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import {
  MdiChevronDown,
  MdiChevronRight,
  MdiDatasetSharp,
  MdiFunction,
  MdiPlus,
  MdiTable,
  MdiTableViewOutline
} from '@cloudhub-ux-icons/mdi';

import TablesTree from '@src/renderer/app/database/schemas/tables/TablesTree';
import FunctionsTree from '@src/renderer/app/database/schemas/functions/FunctionsTree';
import ViewsTree from '@src/renderer/app/database/schemas/views/ViewsTree';
import AddTableDialogButton from './tables/AddTableDialogButton';
import CreateSchemaButton from './schema/CreateSchemaButton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/context-menu';
import QueryComponent from '../../components/editor/QueryComponent';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { createSchemaSqlScript } from '../../mainpage/scripts/scriptGenerator';

function SchemaTree() {
  const { schemas, databaseName, dispatch, dbQuery } = useSelectedDatabaseContext();

  const { openNewTab } = useTabInterfaceContext();

  if (!databaseName) {
    return null;
  }

  const toggleSchema = (schemaName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schemaName]: {
            ...state.selectedDatabaseContext.schemas[schemaName],
            expanded: !state.selectedDatabaseContext.schemas[schemaName].expanded
          }
        }
      }
    }));
  };

  const toggleTables = (schemaName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schemaName]: {
            ...state.selectedDatabaseContext.schemas[schemaName],
            tables: {
              ...state.selectedDatabaseContext.schemas[schemaName].tables,
              expanded: !state.selectedDatabaseContext.schemas[schemaName].tables.expanded
            }
          }
        }
      }
    }));
  };

  const toggleViews = (schemaName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schemaName]: {
            ...state.selectedDatabaseContext.schemas[schemaName],
            views: {
              ...state.selectedDatabaseContext.schemas[schemaName].views,
              expanded: !state.selectedDatabaseContext.schemas[schemaName].views.expanded
            }
          }
        }
      }
    }));
  };

  const toggleFunctions = (schemaName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schemaName]: {
            ...state.selectedDatabaseContext.schemas[schemaName],
            functions: {
              ...state.selectedDatabaseContext.schemas[schemaName].functions,
              expanded: !state.selectedDatabaseContext.schemas[schemaName].functions.expanded
            }
          }
        }
      }
    }));
  };

  const showCreateSql = async (item: { schemaName: string }) => {
    const createSchemaSql = createSchemaSqlScript(item.schemaName);

    const { data, error, timeCost, successMessage } = await dbQuery(createSchemaSql);

    const dataObj: any = {};

    console.log('====================================');
    console.log('data', data);
    console.log('====================================');

    if (Array.isArray(data) && data.length > 0) {
      dataObj.query = data[0].definition;
    }

    const tabId = `create_schema_sql/${item.schemaName}`;

    if (data || error || successMessage) {
      dispatch((state) => ({
        tabInterfaceContext: {
          ...state.tabInterfaceContext,
          tabs: {
            ...state.tabInterfaceContext.tabs,
            [tabId]: {
              ...(state.tabInterfaceContext.tabs[tabId] || {}),
              queryState: {
                query: typeof dataObj.query === 'string' ? dataObj.query : '',
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
      title: `Schema SQL: ${item.schemaName}`,
      type: 'query',
      queryState: {
        query: typeof dataObj.query === 'string' ? dataObj.query : ''
      },
      resultsState: {
        data: []
      },
      queryComponent: <QueryComponent tabId={tabId} />,
      resultsComponent: null
    });
  };

  const level = 0;

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-4')}>
        <li>
          <Block flex={false} row right>
            <Block></Block>
            <Block flex={false}>
              <CreateSchemaButton />
            </Block>
          </Block>
        </li>
        {Object.values(schemas).map((item) => (
          <li key={item.schemaName}>
            <div className="flex items-center">
              <ContextMenu>
                <ContextMenuTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 hover:bg-muted', item.expanded && 'bg-muted')}
                    onClick={() => toggleSchema(item.schemaName)}
                  >
                    {item.expanded ? (
                      <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                    ) : (
                      <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                    )}

                    <MdiDatasetSharp
                      className="shrink-0 mr-1 text-purple-500"
                      height={24}
                      width={24}
                    />
                    <span className="ml-2">{item.schemaName}</span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => showCreateSql(item)}>
                    SQL: Create Script
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={async () => {
                      openNewTab({
                        id: `drop/${item.schemaName}`,
                        title: `Drop SQL: ${item.schemaName}`,
                        type: 'query',
                        queryState: {
                          query: `
                            DROP SCHEMA IF EXISTS ${item.schemaName}`
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: <QueryComponent tabId={`drop/${item.schemaName}`} />,
                        resultsComponent: null
                      });
                    }}
                  >
                    drop
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
            <div>
              {item.expanded && (
                <div>
                  <ul className={cn('space-y-1', 'ml-4')}>
                    <li>
                      <div className="flex items-center">
                        <Block row left>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn('h-8 hover:bg-muted', item.tables.expanded && 'bg-muted')}
                            onClick={() => toggleTables(item.schemaName)}
                          >
                            {item.tables.expanded ? (
                              <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                            ) : (
                              <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                            )}
                            <MdiTable className="h-4 w-4 shrink-0 mr-1 text-blue-500" />
                            <span className="ml-2">Tables</span>
                          </Button>
                        </Block>

                        <Block flex={false}>
                          <AddTableDialogButton schema={item.schemaName} />
                        </Block>
                      </div>
                      <div>{item.tables.expanded && <TablesTree schema={item.schemaName} />}</div>
                    </li>
                    <li>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn('h-8 hover:bg-muted', item.views.expanded && 'bg-muted')}
                          onClick={() => toggleViews(item.schemaName)}
                        >
                          {item.views.expanded ? (
                            <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                          ) : (
                            <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                          )}
                          <MdiTableViewOutline className="h-4 w-4 shrink-0 mr-1 text-cyan-500" />
                          <span className="ml-2">views</span>
                        </Button>
                      </div>
                      <div>{item.views.expanded && <ViewsTree schema={item.schemaName} />}</div>
                    </li>
                    <li>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-8 hover:bg-muted',
                            item.functions.expanded && 'bg-muted'
                          )}
                          onClick={() => toggleFunctions(item.schemaName)}
                        >
                          {item.functions.expanded ? (
                            <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                          ) : (
                            <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                          )}
                          <MdiFunction className="h-4 w-4 shrink-0 mr-1 text-green-500" />
                          <span className="ml-2">functions</span>
                        </Button>
                      </div>
                      <div>
                        {item.functions.expanded && <FunctionsTree schema={item.schemaName} />}
                      </div>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Block>
  );
}

export default SchemaTree;
