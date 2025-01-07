import useAppContext from '@src/renderer/context/useAppContext';
import { AsyncStorage } from '@cloudhub-ux/mui';
import React from 'react';

function useDatabaseContext() {
  const { databaseContext, dispatch } = useAppContext((state) => ({
    databaseContext: state.databaseContext,
    dispatch: state.dispatch
  }));

  const { savedConnections } = databaseContext;

  React.useEffect(() => {
    async function getConnections() {
      const savedConnections = await AsyncStorage.getItem('savedConnections');

      if (savedConnections && Object.keys(savedConnections).length > 0) {
        dispatch((state) => ({
          databaseContext: {
            ...state.databaseContext,
            savedConnections: savedConnections
          }
        }));
      }
    }

    getConnections();
  }, []);

  return {
    ...databaseContext,
    dispatch
  };
}

export default useDatabaseContext;
