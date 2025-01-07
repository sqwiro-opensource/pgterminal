import React from 'react';
import { Block, Button, Scrollbars, Text, toastr } from '@cloudhub-ux/mui';
import useArangoDbServer from '@src/renderer/app/arangodbmigration/context/useArangoDbServer';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import { SimpleTable } from '@cloudhub-ux/mui/dist/tables';
import { Checkbox } from '@mui/material';
import { cn } from '@src/renderer/utils/utils';

const schemaMapping = {
  labfoxx: [
    'labstandard',
    'labparameter',
    'labsample',
    'governingbody',
    'unitofmeasure',
    'labsamplebatch',
    'examinationmethod',
    'materialtype'
  ],
  system: ['merchantuser', 'registration'],
  sales: ['corporatecustomer', 'customer', 'customerorder', 'masterorder']
};

const MigrationKey = 'PGMIGRATION_V3';

const documentMapping: any = {};

Object.keys(schemaMapping).forEach((schema) => {
  schemaMapping[schema].forEach((collection) => {
    documentMapping[`"${collection}/`] = `"${schema}_${collection}/`;
  });
});

function ConnectedDatabase() {
  const { selectedDatabase } = useArangoDbServer();
  const { databaseName, schemas } = useSelectedDatabaseContext();

  const [collections, setCollections] = React.useState<
    Array<{
      collectionName: string;
      numberOfRecords: number;
      migratedRecords: number;
      isMigrated: boolean;
    }>
  >(
    Object.values(schemas).reduce((acc: any, schema) => {
      return [
        ...acc,
        ...Object.values(schema.tables.tableList).map((table) => ({
          collectionName: `${schema.schemaName}.${table.tableName}`,
          numberOfRecords: 0,
          migratedRecords: 0,
          isMigrated: false
        }))
      ];
    }, [])
  );

  React.useEffect(() => {
    const newCollections = Object.values(schemas).reduce((acc: any, schema) => {
      return [
        ...acc,
        ...Object.values(schema.tables.tableList).map((table) => ({
          collectionName: `${schema.schemaName}.${table.tableName}`,
          numberOfRecords: 0,
          migratedRecords: 0,
          isMigrated: false
        }))
      ];
    }, []);

    setCollections(newCollections);
  }, [JSON.stringify(selectedDatabase.collections)]);

  React.useEffect(() => {
    const cleanup = window.electron.on('collection-migration-updated', (data: any) => {
      const { pgtablename, NoOfRecords, MigratedRecords } = data;

      setCollections((prevCollections) =>
        prevCollections.map((collection) =>
          collection.collectionName === pgtablename
            ? {
                ...collection,
                numberOfRecords: NoOfRecords,
                migratedRecords: MigratedRecords,
                isMigrated: MigratedRecords === NoOfRecords
              }
            : collection
        )
      );
    });

    const cleanup2 = window.electron.on('done-checking-migrations', () => {
      toastr.success('Migrations checked successfully');
    });

    return () => {
      cleanup();
      cleanup2();
    };
  }, []);

  if (!(selectedDatabase || {}).databaseName) {
    return null;
  }

  return (
    <Block>
      <Block flex={false} padding>
        <Text bold title>{`Selected Database: ${selectedDatabase.databaseName}`}</Text>
      </Block>

      <Block padding>
        <Block flex={false} row right>
          <Button
            dark
            small
            rounded
            onClick={async () => {
              await window.arangoapi.checkArangoDbMigrations({
                databaseName: selectedDatabase.databaseName,
                collections: collections.map((collection) => collection.collectionName),
                MigrationKey
              });
            }}
            className="mr-2"
          >
            Check Migrations
          </Button>

          <Button
            dark
            small
            rounded
            onClick={() => {
              window.arangoapi.migrateArangoDbCollections({
                arangoDatabase: selectedDatabase,
                postgresDatabase: {
                  databaseName: databaseName,
                  collections: collections
                    .filter(
                      (collection) => collection.numberOfRecords > 0 && !collection.isMigrated
                    )
                    .map((collection) => collection.collectionName)
                },
                documentMapping,
                MigrationKey
              });
            }}
            className="mr-2"
          >
            Migrate Remaining
          </Button>

          <Button
            darkGray
            small
            rounded
            onClick={() => {
              window.arangoapi.migrateArangoDbCollections({
                arangoDatabase: selectedDatabase,
                postgresDatabase: {
                  databaseName: databaseName,
                  collections: collections.map((collection) => collection.collectionName)
                },
                documentMapping,
                MigrationKey
              });
            }}
          >
            Migrate All
          </Button>
        </Block>

        <Block padding>
          <Scrollbars absolute>
            <SimpleTable
              columns={[
                { name: 'collectionName', title: 'Collection Name' },
                { name: 'numberOfRecords', title: 'Number of Records' },
                {
                  name: 'migratedRecords',
                  title: 'Migrated Records',
                  render: (row) => (
                    <Text
                      className={cn(
                        'text-foreground',
                        row.isMigrated ? 'text-green-300' : 'text-red-400'
                      )}
                    >
                      {row.migratedRecords}
                    </Text>
                  )
                },

                {
                  name: 'isMigrated',
                  title: 'Is Migrated',
                  render: (row) => (
                    <Checkbox
                      color={row.isMigrated ? 'success' : 'default'}
                      checked={row.isMigrated}
                    />
                  )
                }
              ]}
              rows={collections}
            />
          </Scrollbars>
        </Block>
      </Block>
    </Block>
  );
}

export default ConnectedDatabase;
