import { Pool, PoolConfig } from 'pg';

declare const plv8: any;

let dbConfig: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} = {} as any;

const connectionPools = new Map<string, Pool>();

export async function testConnection(
  config: PoolConfig
): Promise<{ databases: Array<string>; message?: string }> {
  const connectionPool = new Pool({
    ...config,
    // Set a short connection timeout
    connectionTimeoutMillis: 5000
  });

  try {
    let databases = [];

    if (connectionPool) {
      dbConfig = config;
      const { rows } = await connectionPool.query(`
        SELECT datname
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname;
      `);

      databases = rows.map((row) => row.datname);
      connectionPools.set(config.database, connectionPool);
    }
    return { databases };
  } catch (error: any) {
    console.log('====================================');
    console.log(error);
    console.log('====================================');

    await connectionPool.end();
    return {
      databases: [],
      message: error.code || error.toString() || 'Unknown error occurred'
    };
  }
}
export async function dbQuery(query: string, params?: any[]) {
  const startTime = Date.now();
  try {
    const connectionPool = connectionPools.get(dbConfig.database);

    const data = await connectionPool.query(query, params);

    let rows = [];

    if (Array.isArray(data)) {
      const result = data.find((r) => r.command === 'SELECT');
      rows = (result || {}).rows;
    } else {
      rows = (data || {}).rows;
    }

    const endTime = Date.now();

    if (Array.isArray(rows) && rows.length === 1 && Boolean(rows[0]['?column?'])) {
      return {
        data: rows[0]['?column?'],
        //ms
        timeCost: endTime - startTime,

        successMessage: `Query returned successfully after ${endTime - startTime} msec.`
      };
    }

    return {
      data: rows || [],
      //ms
      timeCost: endTime - startTime,

      successMessage: `Query returned successfully after ${endTime - startTime} msec.`
    };
  } catch (error: any) {
    console.log('====================================');
    console.log('query', query);
    console.log('====================================');
    console.log('====================================');
    console.log(error);
    console.log('====================================');
    const endTime = Date.now();
    return {
      data: [],
      timeCost: endTime - startTime,
      error: error.toString(),
      successMessage: ''
    };
  }
}

export async function getPgTransaction(config: PoolConfig) {
  const pgTransaction = ({
    action = '',
    reads = [],
    writes = [],
    params = {}
  }: {
    action: any;
    reads: any[];
    writes: any[];
    params: any;
  }) => {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      try {
        const ACTION = String(action)
          .replace(/'/g, '__SINGLEQUOTE__')
          .replace(/$/g, '__DOLLARSIGN__')
          .replace(/}__DOLLARSIGN__/g, '}');

        const query = `
                  BEGIN;
                    SELECT dbutils.jsTransaction('${JSON.stringify({
                      ...params,
                      dsName: config.database,
                      dbName: config.database,
                      __collections: []
                    }).replace(/'/g, "''")}', '${ACTION}');
                  COMMIT;
              `
          .replace('function (params', 'function callbackfn(params')
          .replace('function(params', 'function callbackfn(params');

        // if (query.includes("_id FROM bank")) {
        //   console.log("====================================");
        //   console.log("TX QUERY", ACTION);
        //   console.log("====================================");
        // }

        const { data: result, error }: any = await dbQuery(query);

        if (error) {
          return resolve({
            errorMessage: `TX error: ${error}`
          });
        }

        if (!Array.isArray(result)) {
          return resolve(null);
        }

        if (Array.isArray(result)) {
          return resolve(((result[0] || {}).jstransaction || {}).result);
        }
      } catch (error: any) {
        let errorMessage = ((error.response || {}).body || {}).errorMessage || error.toString();

        if (process.env.NODE_ENV === 'development') {
          console.log(`TX ERROR IN database`, errorMessage);
        }

        if (errorMessage.includes('unique constraint violated - in index')) {
          const msg =
            errorMessage.split('of type hash over ')[1] ||
            errorMessage.split('of type persistent over ')[1] ||
            '';
          const key = msg.trim().split(' ')[0].replace(/'/g, '').trim();

          if (key) {
            errorMessage = `${key} already exists in another record.`;
          }
        }

        return resolve({
          errorMessage: `TX error: ${errorMessage}`
        });
      }
    });
  };

  return pgTransaction;
}

export async function disconnectServer(config: PoolConfig) {
  const connectionPool = connectionPools.get(config.database);
  if (connectionPool) {
    try {
      await connectionPool.end();
      connectionPools.delete(config.database);
    } catch (error) {
      //do nothing
    }
  }
}

export async function changeDatabase(database: string) {
  const newConnectionPool =
    connectionPools.get(database) ||
    new Pool({
      ...dbConfig,
      database,
      // Set a short connection timeout
      connectionTimeoutMillis: 5000
    });

  try {
    if (newConnectionPool) {
      dbConfig = {
        ...dbConfig,
        database
      };

      if (!connectionPools.has(database)) {
        connectionPools.set(database, newConnectionPool);
      }
    }

    const { rows } = await newConnectionPool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    ORDER BY schema_name;
  `);

    return rows.map((row) => row.schema_name);
  } catch (error) {
    console.log('====================================');
    console.log(error);
    console.log('====================================');
    return [];
  }
}

export async function saveCollectionsToPostgres({
  databaseName,
  schema,
  tableName,
  dataArray,
  documentMapping
}: {
  databaseName: string;
  schema: string;
  tableName: string;
  dataArray: any[];
  documentMapping: {
    [key: string]: string;
  };
}) {
  // const connectionPool = connectionPools.get(databaseName);

  if (dataArray.length === 0) {
    return {
      success: true,
      message: 'No data to save'
    };
  }

  const pgTransaction = await getPgTransaction(databaseName);

  const { data } = await dbQuery(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' AND table_schema = '${schema}'`
  );

  let tableColumns: string[] = [];

  if (Array.isArray(data)) {
    tableColumns = data
      .map((column) => column.column_name)
      .filter((column) => !['_id'].includes(column));
  }

  // console.log('====================================');
  // console.log('====================================');
  // console.log('tableName', tableName);
  // console.log('schema', schema);
  // console.log('tableColumns', tableColumns);
  // console.log('dataArray', dataArray);
  // console.log('====================================');

  const result = await pgTransaction({
    action: function ({ schema, tableName, dataArray, tableColumns, documentMapping }) {
      function transformValue(value: any) {
        let stringValue = JSON.stringify(value);
        Object.keys(documentMapping).forEach((key) => {
          stringValue = stringValue.replaceAll(key, documentMapping[key]);
        });
        return JSON.parse(stringValue);
      }

      const getDataColumns = (dataRow: any) => {
        return {
          columns: tableColumns.map((column) => `"${column}"`).join(','),
          values: tableColumns.map((column, index) => `_DOLLAR${index + 1}`).join(','),
          realValues: tableColumns.map((column) => {
            if (column === 'id') {
              return dataRow._key;
            }
            return dataRow[column];
          })
        };
      };

      for (const dataRow of dataArray) {
        const { columns, values, realValues } = getDataColumns(dataRow);

        const sql = `INSERT INTO ${schema}.${tableName} (${columns}) VALUES (${values})`.replace(
          /_DOLLAR/g,
          '$'
        );

        try {
          const results = plv8.execute(
            `SELECT 1 as exists FROM ${schema}.${tableName} WHERE id = '${dataRow._key}'`
          );

          if (results.length === 1 && results[0].exists) {
            continue;
          }

          plv8.execute(sql, transformValue(realValues));
        } catch (error: any) {
          if (`${tableName}`.includes('counter')) {
            if (error.toString().includes('violates not-null')) {
              continue;
            }
          }

          throw new Error(
            error.toString() +
              'json: ' +
              JSON.stringify(transformValue(realValues)) +
              '\nsql:' +
              sql
          );
        }
      }

      return {
        success: true,
        message: 'Data saved successfully'
      };
    },
    params: {
      schema,
      tableName,
      dataArray,
      tableColumns,
      documentMapping
    },
    reads: [],
    writes: []
  });

  return result;
}
