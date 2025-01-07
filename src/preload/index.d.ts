import { ElectronAPI } from '@electron-toolkit/preload';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface ArangoDbServerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

declare global {
  interface Window {
    process: {
      env: NodeJS.ProcessEnv;
    };
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
    electron: ElectronAPI & {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      on: (event: string, listener: (data: any) => void) => void;
    };
    api: {
      testConnection: (
        config: PostgresConfig
      ) => Promise<{ databases: string[]; message?: string }>;
      disconnectServer: (config: PostgresConfig) => Promise<void>;
      changeDatabase: (database: string) => Promise<string[]>;
      dbQuery: (
        query: string,
        params?: any[]
      ) => Promise<{
        data: any[];
        timeCost: number;
        error?: string;
        successMessage?: string;
      }>;
    };

    arangoapi: {
      connectArangoDbServer: (config: ArangoDbServerConfig) => Promise<void>;
      arangodbQuery: (query: string) => Promise<{
        data: any[];
        timeCost: number;
        error?: string;
        successMessage?: string;
      }>;
      selectArangoDbDatabase: (database: string) => Promise<string[]>;
      checkArangoDbMigrations: (params: {
        databaseName: string;
        collections: string[];
        MigrationKey: string;
      }) => Promise<void>;

      migrateArangoDbCollections: (params: {
        arangoDatabase: {
          databaseName: string;
          collections: string[];
        };
        postgresDatabase: {
          databaseName: string;
          collections: string[];
        };
        documentMapping: {
          [key: string]: string;
        };
        MigrationKey: string;
      }) => Promise<void>;
    };
  }
}
