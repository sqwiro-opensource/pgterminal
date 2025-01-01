import { Pool, PoolConfig } from 'pg'

let dbConfig: {
  host: string
  port: number
  user: string
  password: string
  database: string
} = {} as any

const connectionPools = new Map<string, Pool>()

export async function testConnection(
  config: PoolConfig
): Promise<{ databases: Array<string>; message?: string }> {
  const connectionPool = new Pool({
    ...config,
    // Set a short connection timeout
    connectionTimeoutMillis: 5000
  })

  try {
    let databases = []

    if (connectionPool) {
      dbConfig = config
      const { rows } = await connectionPool.query(`
        SELECT datname
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname;
      `)

      databases = rows.map((row) => row.datname)
      connectionPools.set(config.database, connectionPool)
    }
    return { databases }
  } catch (error) {
    console.log('====================================')
    console.log(error)
    console.log('====================================')

    await connectionPool.end()
    return {
      databases: [],
      message: error.code || error.toString() || 'Unknown error occurred'
    }
  }
}

export async function disconnectServer(config: PoolConfig) {
  const connectionPool = connectionPools.get(config.database)
  if (connectionPool) {
    try {
      await connectionPool.end()
      connectionPools.delete(config.database)
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
    })

  try {
    if (newConnectionPool) {
      dbConfig = {
        ...dbConfig,
        database
      }

      if (!connectionPools.has(database)) {
        connectionPools.set(database, newConnectionPool)
      }
    }

    const { rows } = await newConnectionPool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    ORDER BY schema_name;
  `)

    return rows.map((row) => row.schema_name)
  } catch (error) {
    console.log('====================================')
    console.log(error)
    console.log('====================================')
    return []
  }
}

export async function dbQuery(query: string, params?: any[]) {
  const startTime = Date.now()
  try {
    const connectionPool = connectionPools.get(dbConfig.database)
    const data = await connectionPool.query(query, params)

    const { rows } = data

    const endTime = Date.now()

    if (Array.isArray(rows) && rows.length === 1 && Boolean(rows[0]['?column?'])) {
      return {
        data: rows[0]['?column?'],
        //ms
        timeCost: endTime - startTime,

        successMessage: `Query returned successfully after ${endTime - startTime} msec.`
      }
    }

    return {
      data: rows || [],
      //ms
      timeCost: endTime - startTime,

      successMessage: `Query returned successfully after ${endTime - startTime} msec.`
    }
  } catch (error: any) {
    console.log('====================================')
    console.log(error)
    console.log('====================================')
    const endTime = Date.now()
    return {
      data: [],
      timeCost: endTime - startTime,
      error: error.toString(),
      successMessage: ''
    }
  }
}
