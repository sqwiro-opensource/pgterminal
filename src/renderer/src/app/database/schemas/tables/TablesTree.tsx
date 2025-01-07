import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { cn } from '@src/renderer/utils/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/context-menu';
import {
  MdiBolt,
  MdiChevronDown,
  MdiChevronRight,
  MdiKeyAlert,
  MdiList,
  MdiRelationManyToMany
} from '@cloudhub-ux-icons/mdi';

import {
  ChevronRight,
  ChevronDown,
  Folder,
  Database,
  Table,
  ActivityIcon as Function,
  GitBranch,
  Eye
} from 'lucide-react';
import TableColumnsTree from '@src/renderer/app/database/schemas/tables/TableColumnsTree';
import TableIndexesTree from '@src/renderer/app/database/schemas/tables/TableIndexesTree';
import TableTriggersTree from '@src/renderer/app/database/schemas/tables/TableTriggersTree';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import TableRelationsTree from '@src/renderer/app/database/schemas/tables/TableRelationsTree';
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent';
import { createTableSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator';

type TreeItem = {
  id: string;
  name: string;
  type:
    | 'schema'
    | 'tables'
    | 'functions'
    | 'procedures'
    | 'triggers'
    | 'views'
    | 'table'
    | 'function'
    | 'procedure'
    | 'trigger'
    | 'view';
  children?: TreeItem[];
};

const IconMap: Record<TreeItem['type'], React.ReactNode> = {
  schema: <Database className="h-4 w-4 shrink-0" />,
  tables: <Folder className="h-4 w-4 shrink-0" />,
  functions: <Folder className="h-4 w-4 shrink-0" />,
  procedures: <Folder className="h-4 w-4 shrink-0" />,
  triggers: <Folder className="h-4 w-4 shrink-0" />,
  views: <Folder className="h-4 w-4 shrink-0" />,
  table: <Table className="h-4 w-4 shrink-0" />,
  function: <Function className="h-4 w-4 shrink-0" />,
  procedure: <GitBranch className="h-4 w-4 shrink-0" />,
  trigger: <GitBranch className="h-4 w-4 shrink-0" />,
  view: <Eye className="h-4 w-4 shrink-0" />
};

function TablesTree({ schema }: { schema: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext();
  const { openTableData, openTableStructure, openNewTab } = useTabInterfaceContext();

  if (!schema) {
    return null;
  }

  const toggleItem = (tableName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schema]: {
            ...state.selectedDatabaseContext.schemas[schema],
            tables: {
              ...state.selectedDatabaseContext.schemas[schema].tables,
              tableList: {
                ...state.selectedDatabaseContext.schemas[schema].tables.tableList,
                [tableName]: {
                  ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName],
                  expanded:
                    !state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                      .expanded
                }
              }
            }
          }
        }
      }
    }));
  };

  const toggleColumns = (tableName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schema]: {
            ...state.selectedDatabaseContext.schemas[schema],
            tables: {
              ...state.selectedDatabaseContext.schemas[schema].tables,
              tableList: {
                ...state.selectedDatabaseContext.schemas[schema].tables.tableList,
                [tableName]: {
                  ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName],
                  columns: {
                    ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                      .columns,
                    expanded:
                      !state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                        .columns.expanded
                  }
                }
              }
            }
          }
        }
      }
    }));
  };

  const toggleIndexes = (tableName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schema]: {
            ...state.selectedDatabaseContext.schemas[schema],
            tables: {
              ...state.selectedDatabaseContext.schemas[schema].tables,
              tableList: {
                ...state.selectedDatabaseContext.schemas[schema].tables.tableList,
                [tableName]: {
                  ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName],
                  indexes: {
                    ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                      .indexes,
                    expanded:
                      !state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                        .indexes.expanded
                  }
                }
              }
            }
          }
        }
      }
    }));
  };

  const toggleTriggers = (tableName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schema]: {
            ...state.selectedDatabaseContext.schemas[schema],
            tables: {
              ...state.selectedDatabaseContext.schemas[schema].tables,
              tableList: {
                ...state.selectedDatabaseContext.schemas[schema].tables.tableList,
                [tableName]: {
                  ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName],
                  triggers: {
                    ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                      .triggers,
                    expanded:
                      !state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                        .triggers.expanded
                  }
                }
              }
            }
          }
        }
      }
    }));
  };

  const toggleRelations = (tableName: string) => {
    dispatch((state) => ({
      selectedDatabaseContext: {
        ...state.selectedDatabaseContext,
        schemas: {
          ...state.selectedDatabaseContext.schemas,
          [schema]: {
            ...state.selectedDatabaseContext.schemas[schema],
            tables: {
              ...state.selectedDatabaseContext.schemas[schema].tables,
              tableList: {
                ...state.selectedDatabaseContext.schemas[schema].tables.tableList,
                [tableName]: {
                  ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName],
                  relations: {
                    ...state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                      .relations,
                    expanded:
                      !state.selectedDatabaseContext.schemas[schema].tables.tableList[tableName]
                        .relations.expanded
                  }
                }
              }
            }
          }
        }
      }
    }));
  };

  const level = 1;

  const tables = schemas[schema].tables.tableList;

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-4')}>
        {Object.values(tables || {}).map((item) => (
          <li key={item.tableName}>
            <div className="flex items-center">
              <ContextMenu>
                <ContextMenuTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 hover:bg-muted', item.expanded && 'bg-muted')}
                    onClick={() => toggleItem(item.tableName)}
                    onDoubleClick={() => {
                      openTableData(schema, item.tableName);
                    }}
                  >
                    {item.expanded ? (
                      <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                    ) : (
                      <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                    )}
                    {IconMap['table']}
                    <span className="ml-2">{item.tableName}</span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() => {
                      openTableData(schema, item.tableName);
                    }}
                  >
                    View Data
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      openTableStructure(schema, item.tableName);
                    }}
                  >
                    View Structure
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => {}}>Export to File</ContextMenuItem>
                  <ContextMenuItem onSelect={() => {}}>Import from File</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={async () => {
                      const getTableCreateSql = createTableSqlScript(schema, item.tableName);

                      const { data, timeCost, error } = await dbQuery(getTableCreateSql);

                      if (error) {
                        console.error('Error getting table create SQL', error);
                        return;
                      }

                      openNewTab({
                        id: `create_sql/${schema}_${item.tableName}`,
                        title: `Create SQL: ${schema}.${item.tableName}`,
                        type: 'query',
                        queryState: {
                          query: typeof data === 'string' ? data : item.createSql
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: (
                          <QueryComponent tabId={`create_sql/${schema}_${item.tableName}`} />
                        ),
                        resultsComponent: null
                      });
                    }}
                  >
                    SQL: Create
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => {}}>Rename</ContextMenuItem>
                  <ContextMenuItem
                    onSelect={async () => {
                      openNewTab({
                        id: `drop/${schema}_${item.tableName}`,
                        title: `Drop SQL: ${schema}.${item.tableName}`,
                        type: 'query',
                        queryState: {
                          query: `
                          DROP TABLE ${schema}."${item.tableName}"`
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: (
                          <QueryComponent tabId={`drop/${schema}_${item.tableName}`} />
                        ),
                        resultsComponent: null
                      });
                    }}
                  >
                    Drop
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={async () => {
                      openNewTab({
                        id: `truncate/${schema}_${item.tableName}`,
                        title: `Truncate SQL: ${schema}.${item.tableName}`,
                        type: 'query',
                        queryState: {
                          query: `
                          TRUNCATE TABLE ${schema}."${item.tableName}"`
                        },
                        resultsState: {
                          data: []
                        },
                        queryComponent: (
                          <QueryComponent tabId={`truncate/${schema}_${item.tableName}`} />
                        ),
                        resultsComponent: null
                      });
                    }}
                  >
                    Truncate
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
            {item.expanded && (
              <>
                <ul className={cn('space-y-1', level > 0 && 'ml-4')}>
                  <li>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-8 hover:bg-muted',
                          item.columns && item.columns.expanded && 'bg-muted'
                        )}
                        onClick={() => toggleColumns(item.tableName)}
                      >
                        {item.columns && item.columns.expanded ? (
                          <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                        ) : (
                          <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                        )}
                        <MdiList />
                        <span className="ml-2">columns</span>
                      </Button>
                    </div>
                    {item.columns && item.columns.expanded && (
                      <TableColumnsTree schema={schema} tableName={item.tableName} />
                    )}
                  </li>
                  <li>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-8 hover:bg-muted',
                          item.indexes && item.indexes.expanded && 'bg-muted'
                        )}
                        onClick={() => toggleIndexes(item.tableName)}
                      >
                        {item.indexes && item.indexes.expanded ? (
                          <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                        ) : (
                          <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                        )}
                        <MdiKeyAlert color="orange" />
                        <span className="ml-2">indexes</span>
                      </Button>
                    </div>
                    {item.indexes && item.indexes.expanded && (
                      <TableIndexesTree schema={schema} tableName={item.tableName} />
                    )}
                  </li>
                  <li>
                    <div className="flex items-center">
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-8 hover:bg-muted',
                              item.triggers && item.triggers.expanded && 'bg-muted'
                            )}
                            onClick={() => toggleTriggers(item.tableName)}
                          >
                            {item.triggers && item.triggers.expanded ? (
                              <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                            ) : (
                              <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                            )}
                            <MdiBolt className="text-yellow-500" />
                            <span className="ml-2">triggers</span>
                          </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => {}}>Open</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </div>
                    {item.triggers && item.triggers.expanded && (
                      <TableTriggersTree schema={schema} tableName={item.tableName} />
                    )}
                  </li>

                  <li>
                    <div className="flex items-center">
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-8 hover:bg-muted',
                              item.relations && item.relations.expanded && 'bg-muted'
                            )}
                            onClick={() => toggleRelations(item.tableName)}
                          >
                            {item.relations && item.relations.expanded ? (
                              <MdiChevronDown className="h-4 w-4 shrink-0 mr-1" />
                            ) : (
                              <MdiChevronRight className="h-4 w-4 shrink-0 mr-1" />
                            )}
                            <MdiRelationManyToMany className="text-yellow-800" />
                            <span className="ml-2">relations</span>
                          </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => {}}>Open</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </div>
                    {item.relations && item.relations.expanded && (
                      <TableRelationsTree schema={schema} tableName={item.tableName} />
                    )}
                  </li>
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>
    </Block>
  );
}

export default TablesTree;
