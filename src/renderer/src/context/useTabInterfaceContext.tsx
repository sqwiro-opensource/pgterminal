import useAppContext from '@src/renderer/context/useAppContext';
import { AsyncStorage } from '@cloudhub-ux/mui';
import React from 'react';
import MonacoEditor from '@src/renderer/app/components/editor/MonacoSqlEditor';
import ResultsDataTable from '@src/renderer/app/components/results/ResultsDataTable';
import QueryComponent from '@src/renderer/app/components/editor/QueryComponent';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import TableStructure from '@src/renderer/app/database/schemas/structures/TableStructure';
import DocumentViewer from '@src/renderer/app/components/document/DocumentViewer';

interface Tab {
  id: string;
  title: string;
  type:
    | 'query'
    | 'table_data'
    | 'table_document'
    | 'query_and_results'
    | 'table_structure'
    | 'view_structure'
    | 'view_data';
  queryState: any;
  resultsState: any;
  queryComponent: any;
  resultsComponent: any;
}

function useTabInterfaceContext() {
  const { tabInterfaceContext, dispatch } = useAppContext((state) => ({
    tabInterfaceContext: state.tabInterfaceContext,
    dispatch: state.dispatch
  }));

  const { dbQuery } = useSelectedDatabaseContext();

  const { tabs, activeTabId } = tabInterfaceContext;

  const openNewTab = (tabParams: Tab) => {
    const newTab: Tab = {
      id: tabParams.id,
      title: tabParams.title,
      type: tabParams.type,
      queryState: tabParams.queryState,
      resultsState: {
        ...tabParams.resultsState,
        view: 'table',
        pagination: {
          pageIndex: 0,
          pageSize: 100
        }
      },
      queryComponent: tabParams?.queryComponent || null,
      resultsComponent: tabParams?.resultsComponent || null
    };

    dispatch((state) => ({
      tabInterfaceContext: {
        ...state.tabInterfaceContext,
        tabs: {
          ...state.tabInterfaceContext.tabs,
          [newTab.id]: newTab
        },
        activeTabId: newTab.id
      }
    }));
  };

  const openQueryTab = (tabParams: Tab = {} as any) => {
    const unNamedTabs = Object.values(tabs || {})
      .filter((tab) => tab.title.startsWith('Query#'))
      .map((tab) => Number(tab.title.split('#')[1]));
    const lastTab = unNamedTabs.length > 0 ? Math.max(...unNamedTabs) : 0;

    const newTabTitle = tabParams?.title || `Query#${lastTab + 1}`;

    const newTab: Tab = {
      id: tabParams?.id || newTabTitle,
      title: newTabTitle,
      type: tabParams?.type || 'query',
      queryState: tabParams?.queryState || {},
      resultsState: {
        ...tabParams?.resultsState,
        view: 'table',
        pagination: {
          pageIndex: 0,
          pageSize: 100
        }
      },
      queryComponent: <QueryComponent tabId={newTabTitle} />,
      resultsComponent: <ResultsDataTable tabId={newTabTitle} schema="public" />
    };

    dispatch((state) => ({
      tabInterfaceContext: {
        ...state.tabInterfaceContext,
        tabs: {
          ...state.tabInterfaceContext.tabs,
          [newTab.id]: newTab
        },
        activeTabId: newTab.id
      }
    }));
  };

  const openDocumentTab = ({
    schema,
    tableName,
    pk,
    value,
    document
  }: {
    schema: string;
    tableName?: string;
    pk: string;
    value: string;
    document: any;
  }) => {
    const tabId = `document/${schema}.${tableName}`;

    const newTab: Tab = {
      id: tabId,
      title: `${tabId}`,
      type: 'table_document',
      queryState: {},
      resultsState: {},
      queryComponent: null,
      resultsComponent: (
        <DocumentViewer
          schema={schema}
          tableName={tableName}
          pk={pk}
          value={value}
          document={document}
        />
      )
    };

    openNewTab(newTab);
  };

  const openTableData = React.useCallback(async (schemaName: string, tableName: string) => {
    const { data, timeCost } = await dbQuery(`SELECT * FROM ${schemaName}.${tableName} LIMIT 100`);

    const tabId = `table_data/${schemaName}.${tableName}`;
    const tabTitle = `${schemaName}.${tableName}`;

    openNewTab({
      id: tabId,
      title: tabTitle,
      type: 'table_data',
      queryState: {
        query: `SELECT * FROM ${schemaName}.${tableName} LIMIT 100`
      },
      resultsState: {
        data,
        timeCost
      },
      queryComponent: <QueryComponent tabId={tabId} />,
      resultsComponent: <ResultsDataTable tabId={tabId} schema={schemaName} tableName={tableName} />
    });
  }, []);

  const openTableStructure = React.useCallback(async (schemaName: string, tableName: string) => {
    const tabId = `table_data/${schemaName}.${tableName}`;
    const tabTitle = `${schemaName}.${tableName}`;

    openNewTab({
      id: tabId,
      title: tabTitle,
      type: 'table_structure',
      queryState: {
        query: `SELECT * FROM ${schemaName}.${tableName} LIMIT 100`
      },
      resultsState: {
        data: [],
        timeCost: 0
      },
      queryComponent: null,
      resultsComponent: (
        <TableStructure schemaName={schemaName} tableName={tableName} tabId={tabId} />
      )
    });
  }, []);

  const closeTab = (closedTab: Tab) => {
    // setTabs((prevTabs) => prevTabs.filter((tab) => tab.id !== closedTab.id))

    let ActiveTabId = activeTabId;

    dispatch((state) => {
      ActiveTabId = state.tabInterfaceContext.activeTabId;

      return {
        tabInterfaceContext: {
          ...state.tabInterfaceContext,
          tabs: Object.fromEntries(
            Object.entries(state.tabInterfaceContext.tabs || {}).filter(
              ([key]) => key !== closedTab.id
            )
          )
        }
      };
    });

    if (ActiveTabId) {
      if (ActiveTabId === closedTab.id) {
        dispatch((state) => {
          const lastTab = Object.values(state.tabInterfaceContext.tabs || {}).at(-1);

          return {
            tabInterfaceContext: {
              ...state.tabInterfaceContext,
              activeTabId: lastTab?.id || null
            }
          };
        });
      } else {
        dispatch((state) => ({
          tabInterfaceContext: {
            ...state.tabInterfaceContext,
            activeTabId: ActiveTabId
          }
        }));
      }
    }
  };

  return {
    ...tabInterfaceContext,
    openNewTab,
    closeTab,
    dispatch,

    ///tab functions
    openQueryTab,
    openTableData,
    openTableStructure,
    openDocumentTab
  };
}

export default useTabInterfaceContext;
