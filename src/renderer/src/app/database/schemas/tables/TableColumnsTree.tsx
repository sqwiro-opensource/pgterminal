import React from 'react'
import { Block } from '@cloudhub-ux/mui'
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext'
import { cn } from '@src/renderer/utils/utils'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { MdiCube, MdiKey } from '@cloudhub-ux-icons/mdi'
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent'
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext'
import { createColumnSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator'

function TableColumnsTree({ schema, tableName }: { schema: string; tableName: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext()

  const { openNewTab } = useTabInterfaceContext()

  if (!schema || !tableName) {
    return null
  }

  const level = 1

  const columns = schemas[schema].tables.tableList[tableName].columns.columnList

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(columns || {}).map((item) => (
          <li key={item.name}>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 hover:bg-muted')}
                onDoubleClick={async () => {
                  const createColumnSql = createColumnSqlScript(schema, tableName, item.name)

                  const { data, error, timeCost, successMessage } = await dbQuery(createColumnSql)

                  const tabId = `create_column_sql/${item.name}`

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
                    }))
                  }

                  openNewTab({
                    id: tabId,
                    title: `Column SQL: ${item.name}`,
                    type: 'query',
                    queryState: {
                      query: typeof data === 'string' ? data : ''
                    },
                    resultsState: {
                      data: []
                    },
                    queryComponent: <QueryComponent tabId={tabId} />,
                    resultsComponent: null
                  })
                }}
              >
                <MdiCube size={16} color="orange" className="h-4 w-4 shrink-0 mr-1" />
                {item.isPrimaryKey && (
                  <MdiKey size={16} className="h-4 w-4 shrink-0 mr-1 text-yellow-500" />
                )}
                <span className="ml-2">{item.name}</span>
                <span className="ml-2 text-muted-foreground">{item.dataType}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Block>
  )
}

export default TableColumnsTree
