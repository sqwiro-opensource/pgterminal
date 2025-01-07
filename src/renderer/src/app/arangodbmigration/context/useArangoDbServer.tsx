import useAppContext from '@src/renderer/context/useAppContext';
import React from 'react';

function useArangoDbServer() {
  const { arangoDbServerContext, dispatch } = useAppContext((state) => ({
    arangoDbServerContext: state.arangoDbServerContext,
    databaseContext: state.databaseContext,
    dispatch: state.dispatch
  }));

  const arangodbQuery = React.useCallback(async (query: string) => {
    return await window.api.arangodbQuery(query);
  }, []);

  return {
    ...arangoDbServerContext,
    arangodbQuery,
    dispatch
  };
}

export default useArangoDbServer;
