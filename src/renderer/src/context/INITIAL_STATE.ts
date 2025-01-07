export type IInitialState = {
  authContext: {
    user: {
      id: string;
      name: string;
      email: string;
    };
  };

  databaseContext: {
    databases: string[];
    defaultDatabase: string;
    selectedDatabase: string;
    selectedConnection: string;
    savedConnections: {
      [key: string]: {
        name: string;
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
      };
    };
  };

  selectedDatabaseContext: {
    databaseName: string;
    schemas: {
      [key: string]: {
        schemaName: string;
        expanded: boolean;
        tables: {
          expanded: boolean;
          tableList: {
            [key: string]: {
              tableName: string;
              expanded: boolean;
              createSql: string;
              columns: {
                expanded: boolean;
                columnList: {
                  [key: string]: {
                    name: string;
                    dataType: string;
                    isNullable: boolean;
                    defaultValue: string;
                    isPrimaryKey: boolean;
                    isUnique: boolean;
                    isForeignKey: boolean;
                  };
                };
              };
              indexes: {
                expanded: boolean;
                indexList: {
                  [key: string]: {
                    indexName: string;
                  };
                };
              };
              triggers: {
                expanded: boolean;
                triggerList: {
                  [key: string]: {
                    triggerName: string;
                  };
                };
              };
              relations: {
                expanded: boolean;
                relationList: {
                  [key: string]: {
                    relationName: string;
                  };
                };
              };
            };
          };
        };
        functions: {
          expanded: boolean;
          functionList: {
            [key: string]: {
              functionName: string;
              language: string;
              arguments: string;
              returnType: string;
            };
          };
        };
        procedures: {
          expanded: boolean;
          procedureList: {
            [key: string]: {
              procedureName: string;
            };
          };
        };
        triggers: {
          expanded: boolean;
          triggerList: {
            [key: string]: {
              triggerName: string;
            };
          };
        };
        views: {
          expanded: boolean;
          viewList: {
            [key: string]: {
              expanded: boolean;
              viewName: string;
              query: string;
              columns: {
                expanded: boolean;
                columnList: {
                  [key: string]: {
                    name: string;
                    dataType: string;
                    isNullable: boolean;
                    defaultValue: string;
                    isPrimaryKey: boolean;
                    isUnique: boolean;
                    isForeignKey: boolean;
                  };
                };
              };
            };
          };
        };
      };
    };
  };

  tabInterfaceContext: {
    tabs: {
      [key: string]: {
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
        queryState: {
          query: string;
          error: string;
          timeCost: number;
          successMessage: string;
        };
        resultsState: {
          data: any;
          error: string;
          view: 'table' | 'json';
          pagination: {
            pageIndex: number;
            pageSize: number;
          };
        };
        queryComponent: any;
        resultsComponent: any;
      };
    };
    activeTabId: string | null;
  };

  arangoDbServerContext: {
    connectedDataseServer: {
      connectionDetails: {
        host: string;
        port: number;
        username: string;
        password: string;
      };
      databases: string[];
    };

    selectedDatabase: {
      databaseName: string;
      collections: string[];
    };

    savedConnections: {
      [key: string]: {
        servername: string;
        host: string;
        port: number;
        username: string;
        password: string;
      };
    };
  };

  dispatch: (
    cb: (state: IInitialState) => {
      [K in keyof IInitialState]?: IInitialState[K];
    }
  ) => void;
};

const INITIAL_STATE: Omit<IInitialState, 'dispatch'> = {
  authContext: {
    user: {
      id: '',
      name: '',
      email: ''
    }
  },
  databaseContext: {
    databases: [],
    selectedDatabase: '',
    defaultDatabase: '',
    selectedConnection: '',
    savedConnections: {}
  },

  selectedDatabaseContext: {
    databaseName: '',
    schemas: {}
  },

  arangoDbServerContext: {
    connectedDataseServer: {
      connectionDetails: {
        host: '',
        port: 0,
        username: '',
        password: ''
      },
      databases: []
    },
    selectedDatabase: {
      databaseName: '',
      collections: []
    },
    savedConnections: {
      localhost: {
        servername: 'localhost',
        host: 'localhost',
        port: 8529,
        username: 'root',
        password: ''
      }
    }
  },

  tabInterfaceContext: {
    tabs: {},
    activeTabId: null
  }
};

export default INITIAL_STATE;
