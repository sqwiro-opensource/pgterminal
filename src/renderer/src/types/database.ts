export interface ServerConfig {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
}

export interface DatabaseSchema {
  name: string
  tables: DatabaseTable[]
  views: DatabaseView[]
  functions: DatabaseFunction[]
  queries: SavedQuery[]
}

export interface DatabaseTable {
  name: string
  schema: string
}

export interface DatabaseView {
  name: string
  schema: string
}

export interface DatabaseFunction {
  name: string
  schema: string
}

export interface SavedQuery {
  id: string
  name: string
  query: string
}
