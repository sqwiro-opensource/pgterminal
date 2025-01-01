import React from 'react'
import { Block } from '@cloudhub-ux/mui'
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext'
import { cn } from '@src/renderer/utils/utils'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import {
  MdiChevronDown,
  MdiChevronRight,
  MdiDatasetSharp,
  MdiFunction,
  MdiTable,
  MdiTableViewOutline
} from '@cloudhub-ux-icons/mdi'

import {
  ChevronRight,
  ChevronDown,
  Folder,
  Database,
  Table,
  ActivityIcon as Function,
  GitBranch,
  Eye
} from 'lucide-react'
import TablesTree from '@src/renderer/app/database/schemas/tables/TablesTree'
import FunctionsTree from '@src/renderer/app/database/schemas/functions/FunctionsTree'
import ViewsTree from '@src/renderer/app/database/schemas/views/ViewsTree'

interface TreeViewProps {
  schemas: {
    [key: string]: {
      schemaName: string
      tables: {
        [key: string]: string
      }
      functions: {
        [key: string]: string
      }
      procedures: {
        [key: string]: string
      }
      triggers: {
        [key: string]: string
      }
      views: {
        [key: string]: string
      }
    }
  }
}

type TreeItem = {
  id: string
  name: string
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
    | 'view'
  children?: TreeItem[]
}

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
}

function SchemaTree() {
  const { schemas, databaseName, dispatch } = useSelectedDatabaseContext()

  if (!databaseName) {
    return null
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
    }))
  }

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
    }))
  }

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
    }))
  }

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
    }))
  }

  const level = 0

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-4')}>
        {Object.values(schemas).map((item) => (
          <li key={item.schemaName}>
            <div className="flex items-center">
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

                <MdiDatasetSharp className="shrink-0 mr-1 text-purple-500" height={24} width={24} />
                <span className="ml-2">{item.schemaName}</span>
              </Button>
            </div>
            <div>
              {item.expanded && (
                <div>
                  <ul className={cn('space-y-1', 'ml-4')}>
                    <li>
                      <div className="flex items-center">
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
  )
}

export default SchemaTree
