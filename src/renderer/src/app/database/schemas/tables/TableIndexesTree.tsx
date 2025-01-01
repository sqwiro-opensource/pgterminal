import React from 'react'
import { Block } from '@cloudhub-ux/mui'
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext'
import { cn } from '@src/renderer/utils/utils'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { MdiKeyAlertOutline } from '@cloudhub-ux-icons/mdi'
import { colors } from '@src/renderer/theme'
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent'
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext'
import { createIndexSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator'

function TableIndexesTree({ schema, tableName }: { schema: string; tableName: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext()
  const { openNewTab } = useTabInterfaceContext()
  if (!schema || !tableName) {
    return null
  }
  const level = 1

  const indexes = schemas[schema].tables.tableList[tableName].indexes.indexList

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(indexes || {}).map((item) => (
          <li key={item.indexName}>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 hover:bg-muted')}
                onDoubleClick={async () => {
                  const createIndexSql = createIndexSqlScript(schema, tableName, item.indexName)
                  const { data, error, timeCost, successMessage } = await dbQuery(createIndexSql)

                  const tabId = `create_index_sql/${item.indexName}`

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
                  })
                }}
              >
                <MdiKeyAlertOutline
                  size={16}
                  color={colors.red[300]}
                  className="h-4 w-4 shrink-0 mr-1"
                />
                <span className="ml-2">{item.indexName}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Block>
  )
}

export default TableIndexesTree
