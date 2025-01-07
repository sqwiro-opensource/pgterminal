import { Database } from 'arangojs';
import { ipcMain } from 'electron';
import { c } from 'vite/dist/node/types.d-aGj9QkWt';
import { sendToRenderer } from '..';
import type { ArangoDbServerConfig, PostgresConfig } from '../../preload/index.d';
import { dbQuery, saveCollectionsToPostgres } from '../db/pgserver';

const dbServerConnections = new Map<string, Database>();

export async function connectArangoDbServer(config: ArangoDbServerConfig) {
  const connectionKey = `${config.host}/${config.database || '_system'}`;

  const _database = config.database || '_system';

  if (dbServerConnections.has(`${connectionKey}`)) {
    return dbServerConnections.get(`${connectionKey}`);
  }

  const dbServerConnection = new Database({
    url: `http://${config.host}:${config.port}`,
    databaseName: _database,
    auth: { username: config.username, password: config.password }
  });

  const databases = await dbServerConnection.databases();

  // dbServerConnections.set(`${connectionKey}`, dbServerConnection);

  for (const db of databases) {
    dbServerConnections.set(`${db._name}`, db);
  }

  return databases.map((db) => db._name || db._name());
}

export async function selectArangoDbDatabase(database: string) {
  const dbConnection = dbServerConnections.get(`${database}`);

  if (!dbConnection) {
    throw new Error('Database not found');
  }

  const collections = await dbConnection.collections();

  return collections.map((collection) => collection.name);
}

export async function createMigrationDocuments({
  dbConnection,
  postgrescollections,
  arangocollections,
  MigrationKey,
  pgmigrationcollection
}: {
  dbConnection: Database;
  postgrescollections: string[];
  arangocollections: string[];
  MigrationKey: string;
  pgmigrationcollection: any;
}) {
  for (const coll of postgrescollections) {
    let collectionName = coll;
    let schema = '';
    let tableName = '';

    if (collectionName.includes('.')) {
      schema = collectionName.split('.')[0];
      tableName = collectionName.split('.')[1];
      collectionName = collectionName.split('.')[1];
    }

    if (collectionName.includes('_')) {
      collectionName = collectionName.split('_')[1];
    }

    if (!arangocollections.includes(collectionName)) {
      continue;
    }

    const countCursor = await dbConnection.query(`FOR rec IN ${collectionName}
      FILTER rec.MigrationKey != '${MigrationKey}'
      COLLECT WITH COUNT INTO count
      RETURN {count}`);

    const countArray = await countCursor.all();
    const count = countArray[0].count;

    const _key = `${collectionName}-${MigrationKey}`;

    const exists = await pgmigrationcollection.document(
      { _key },
      {
        graceful: true
      }
    );

    if (!exists) {
      await pgmigrationcollection.save({
        _key,
        collectionName,
        pgtablename: `${schema}.${tableName}`,
        MigrationKey,
        NoOfRecords: count,
        MigratedRecords: 0
      });
    }

    console.log(`Created migration count for ${coll} with key ${_key}: ${count}`);
  }
}

export async function migrateArangoDbCollections({
  arangoDatabase,
  postgresDatabase,
  documentMapping,
  MigrationKey = 'PGMIGRATION'
}: {
  arangoDatabase: {
    connectionDetails: ArangoDbServerConfig;
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
}) {
  const dbConnection = dbServerConnections.get(`${arangoDatabase.databaseName}`);

  if (!dbConnection) {
    throw new Error('Database not found');
  }

  const pgmigrationcollection = dbConnection.collection('pgmigration');
  const exists = await pgmigrationcollection.exists();

  if (!exists) {
    await pgmigrationcollection.create();
  }

  await createMigrationDocuments({
    dbConnection,
    postgrescollections: postgresDatabase.collections,
    arangocollections: arangoDatabase.collections,
    MigrationKey,
    pgmigrationcollection
  });

  async function migrateCollection({
    collectionName,
    schema,
    tableName,
    MigrationKey
  }: {
    collectionName: string;
    schema: string;
    tableName: string;
    MigrationKey: string;
  }) {
    if (!dbConnection) {
      throw new Error('Database not found');
    }

    const trx = await dbConnection.beginTransaction({
      read: [collectionName, 'pgmigration'],
      write: [collectionName, 'pgmigration'] // collection instances can be passed directly
    });

    try {
      // count all the records in the collection

      const collection = dbConnection.collection(collectionName);
      const { count: collectionCount } = await collection.count();

      const cursor = await dbConnection.query(`FOR rec IN ${collectionName}
      FILTER rec.MigrationKey != '${MigrationKey}'
      LIMIT 1000
      RETURN rec`);
      const dataArray = await cursor.all();
      const migratedKeys = dataArray.map((rec) => rec._key);

      const saveResults = await saveCollectionsToPostgres({
        databaseName: postgresDatabase.databaseName,
        schema,
        tableName,
        dataArray,
        documentMapping
      });

      if (!saveResults || (saveResults as any).errorMessage) {
        throw new Error(
          `Failed to save records to Postgres: ${((saveResults as any) || {}).errorMessage}`.substring(
            0,
            1000
          )
        );
      }

      if (saveResults) {
        const migrationDocument = await pgmigrationcollection.document(
          {
            _key: `${collectionName}-${MigrationKey}`
          },
          {
            graceful: true
          }
        );

        if (migrationDocument) {
          await trx.step(() =>
            pgmigrationcollection.update(
              {
                _key: migrationDocument._key
              },
              {
                NoOfRecords: collectionCount,
                MigratedRecords: migrationDocument.MigratedRecords + migratedKeys.length
              }
            )
          );
        }

        const aql = `FOR rec IN ${collectionName}
          FILTER rec._key IN [${migratedKeys.map((key) => `"${key}"`).join(',')}]
          UPDATE rec WITH { MigrationKey: '${MigrationKey}' } IN ${collectionName}`;

        await trx.step(() => dbConnection.query(aql));
      }

      await trx.commit();

      // console.log('====================================');
      // console.log('committed collectionName', collectionName, migratedKeys);
      // console.log('====================================');
    } catch (error) {
      console.log('====================================');
      console.log('error', error);
      console.log('====================================');
      await trx.abort();
      throw error;
    }

    const countCursor = await dbConnection.query(`FOR rec IN ${collectionName}
      FILTER rec.MigrationKey != '${MigrationKey}'
      COLLECT WITH COUNT INTO count
      RETURN {count}`);

    const countArray = await countCursor.all();
    const count = countArray[0].count;

    console.log(`Migrating ${collectionName} to ${tableName}: Remaining ${count} records...`);

    if (count > 0) {
      return await migrateCollection({
        collectionName,
        schema,
        tableName,
        MigrationKey
      });
    }

    return true;
  }

  await checkArangoDbMigrations({
    databaseName: arangoDatabase.databaseName,
    collections: arangoDatabase.collections,
    MigrationKey
  });

  const collectionsToMigrateCursor = await dbConnection.query(
    `FOR rec IN pgmigration FILTER rec.MigrationKey=='${MigrationKey}' return rec`
  );

  const collectionsToMigrate = await collectionsToMigrateCursor.all();

  for (const collection of collectionsToMigrate) {
    if (collection.NoOfRecords === 0 || collection.NoOfRecords === collection.MigratedRecords) {
      continue;
    }

    const schema = collection.pgtablename.split('.')[0];
    const tableName = collection.pgtablename.split('.')[1];

    let collectionName = tableName;
    if (collectionName.includes('_')) {
      collectionName = collectionName.split('_')[1];
    }

    console.log('====================================');
    console.log('migrating collection', collectionName);
    console.log('====================================');

    await migrateCollection({
      collectionName,
      schema,
      tableName,
      MigrationKey
    });

    await checkCollectionMigration({
      dbConnection,
      collectionName,
      MigrationKey
    });
  }
}

export async function checkArangoDbMigrations({
  databaseName,
  collections,
  MigrationKey
}: {
  databaseName: string;
  collections: string[];
  MigrationKey: string;
}) {
  const dbConnection = dbServerConnections.get(`${databaseName}`);

  if (!dbConnection) {
    throw new Error(`Database ${databaseName} not found`);
  }

  console.log('====================================');
  console.log('checking migrations for database', databaseName, collections, MigrationKey);
  console.log('====================================');

  for (const coll of collections) {
    let collectionName = coll;

    if (collectionName.includes('.')) {
      collectionName = collectionName.split('.')[1];
    }

    if (collectionName.includes('_')) {
      collectionName = collectionName.split('_')[1];
    }

    await checkCollectionMigration({
      dbConnection,
      collectionName,
      MigrationKey
    });
  }

  sendToRenderer('done-checking-migrations', {});
}

export async function checkCollectionMigration({
  dbConnection,
  collectionName,
  MigrationKey
}: {
  dbConnection: Database;
  collectionName: string;
  MigrationKey: string;
}) {
  const pgmigrationcollection = dbConnection.collection('pgmigration');

  const pgmigrationcollectionCursor = await dbConnection.query(`FOR rec IN pgmigration
    FILTER rec.MigrationKey == '${MigrationKey}' && rec.collectionName == '${collectionName}'
  RETURN rec`);

  const pgmigrationArray = await pgmigrationcollectionCursor.all();

  for (const rec of [...pgmigrationArray]) {
    const { data } = await dbQuery(`SELECT COUNT(*) FROM ${rec.pgtablename};`);

    console.log(`${rec.pgtablename} has ${Number(([...data][0] || {}).count || 0)} records`);

    const updateResult = await pgmigrationcollection.update(
      {
        _key: rec._key
      },
      {
        MigratedRecords: Number(([...data][0] || {}).count || 0)
      },
      {
        returnNew: true
      }
    );

    sendToRenderer('collection-migration-updated', updateResult.new);
  }
}

export async function arangodbQuery(query: string) {
  return await arangodbQuery(query);
}
