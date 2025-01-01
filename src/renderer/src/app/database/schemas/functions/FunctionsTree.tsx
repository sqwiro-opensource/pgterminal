import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { cn } from '@src/renderer/utils/utils';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { MdiBolt, MdiFunctionRounded } from '@cloudhub-ux-icons/mdi';
import { colors } from '@src/renderer/theme';
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent';
import { createFunctionSqlScript } from '@src/renderer/app/mainpage/scripts/scriptGenerator';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';

function FunctionsTree({ schema }: { schema: string }) {
  const { schemas, dispatch, dbQuery } = useSelectedDatabaseContext();

  const { openNewTab } = useTabInterfaceContext();

  if (!schema) {
    return null;
  }

  const level = 1;

  const functions = schemas[schema].functions.functionList;

  return (
    <Block flex={false}>
      <ul className={cn('space-y-1', level > 0 && 'ml-8')}>
        {Object.values(functions || {}).map((item) => (
          <li key={item.functionName}>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 hover:bg-muted')}
                onDoubleClick={async () => {
                  const createFunctionSql = createFunctionSqlScript(schema, item.functionName);

                  const { data, error, timeCost, successMessage } =
                    await dbQuery(createFunctionSql);

                  const tabId = `create_function_sql/${item.functionName}`;

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
                    title: `Function SQL: ${item.functionName}`,
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
                }}
              >
                <MdiFunctionRounded
                  size={16}
                  color={colors.green[300]}
                  className="h-4 w-4 shrink-0 mr-1"
                />

                <span className="ml-2">{`${item.functionName}(${item.arguments})`} </span>
                <span className="ml-2 text-xs text-muted-foreground">{`${item.returnType}/${item.language}`}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Block>
  );
}

export default FunctionsTree;
