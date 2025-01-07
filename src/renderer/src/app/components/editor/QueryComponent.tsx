import React from 'react';
import { Alert, Block, Text } from '@cloudhub-ux/mui';
import MonacoEditor from '@src/renderer/app/components/editor/MonacoSqlEditor';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { MdiClock, MdiPlay, MdiSave } from '@cloudhub-ux-icons/mdi';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';

import { format } from 'sql-formatter';

function QueryComponent({ tabId }: { tabId: string }) {
  const { tabs, dispatch } = useTabInterfaceContext();
  const { dbQuery, reload } = useSelectedDatabaseContext();

  const onChange = (value, event) => {
    dispatch((state) => {
      return {
        tabInterfaceContext: {
          ...state.tabInterfaceContext,
          tabs: {
            ...state.tabInterfaceContext.tabs,
            [tabId]: {
              ...state.tabInterfaceContext.tabs[tabId],
              queryState: {
                ...(state.tabInterfaceContext.tabs[tabId].queryState || {}),
                query: value
              }
            }
          }
        }
      };
    });
  };

  const { queryState } = tabs[tabId] || {};

  let sqlStatement = queryState?.query || '';
  try {
    sqlStatement = format(queryState?.query || '', {
      language: 'postgresql',
      tabWidth: 2,
      keywordCase: 'upper',
      linesBetweenQueries: 2
    });
  } catch (error) {
    //
  }

  return (
    <Block>
      <Block>
        <MonacoEditor defaultValue={sqlStatement || ''} onChange={onChange} />
      </Block>

      <Block flex={false} row padding={5}>
        <Alert
          error
          message={queryState.error}
          onClose={() => {
            dispatch((state) => ({
              tabInterfaceContext: {
                ...state.tabInterfaceContext,
                tabs: {
                  ...state.tabInterfaceContext.tabs,
                  [tabId]: {
                    ...state.tabInterfaceContext.tabs[tabId],
                    queryState: {
                      ...state.tabInterfaceContext.tabs[tabId].queryState,
                      error: ''
                    }
                  }
                }
              }
            }));
          }}
        />

        <Alert
          success
          message={queryState.successMessage}
          onClose={() => {
            dispatch((state) => ({
              tabInterfaceContext: {
                ...state.tabInterfaceContext,
                tabs: {
                  ...state.tabInterfaceContext.tabs,
                  [tabId]: {
                    ...state.tabInterfaceContext.tabs[tabId],
                    queryState: {
                      ...state.tabInterfaceContext.tabs[tabId].queryState,
                      successMessage: ''
                    }
                  }
                }
              }
            }));
          }}
        />
      </Block>

      <Block flex={false} row middle padding={5}>
        <Block>
          <Block flex={false} row middle>
            <MdiClock size={16} className="text-muted-foreground" />
            <Text h5 className="text-sm text-muted-foreground">
              {queryState.timeCost}ms
            </Text>
          </Block>
        </Block>

        <Block flex={false} row middle>
          <Button size="sm" variant="outline" className="ml-2 h-6 rounded-lg">
            <MdiSave size={18} className="ml-2 h-8 w-8" /> Save
          </Button>
          <Button
            size="sm"
            className="ml-2 h-6 rounded-lg bg-black text-white"
            onClick={async () => {
              const { data, error, timeCost, successMessage } = await dbQuery(
                queryState?.query || ''
              );

              console.log('data', data);
              console.log('error', error);
              console.log('timeCost', timeCost);
              console.log('successMessage', successMessage);

              if (data || error || successMessage) {
                dispatch((state) => ({
                  tabInterfaceContext: {
                    ...state.tabInterfaceContext,
                    tabs: {
                      ...state.tabInterfaceContext.tabs,
                      [tabId]: {
                        ...state.tabInterfaceContext.tabs[tabId],
                        queryState: {
                          ...state.tabInterfaceContext.tabs[tabId].queryState,
                          timeCost: timeCost,
                          error: error || '',
                          successMessage: successMessage || ''
                        },
                        resultsState: {
                          ...state.tabInterfaceContext.tabs[tabId].resultsState,
                          data: data || [],
                          error: error || ''
                        }
                      }
                    }
                  }
                }));

                reload();
              }
            }}
          >
            Run <MdiPlay size={18} className="ml-2 h-8 w-8" />
          </Button>
        </Block>
      </Block>
    </Block>
  );
}

export default QueryComponent;
