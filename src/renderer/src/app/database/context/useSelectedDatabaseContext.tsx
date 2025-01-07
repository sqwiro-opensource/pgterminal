import React from 'react';
import useAppContext from '@src/renderer/context/useAppContext';

const dbStructureSql = `
WITH RECURSIVE
-- First get all valid schemas
schemas_list AS (
  SELECT n.nspname as schema_name
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND n.nspname NOT LIKE 'pg_%'
),
-- Get all columns information
columns_info AS (
  SELECT
    n.nspname as schema_name,
    c.relname as table_name,
    jsonb_object_agg(
      a.attname,
      jsonb_build_object(
        'name', a.attname,
        'dataType', format_type(a.atttypid, a.atttypmod),
        'isNullable', NOT a.attnotnull,
        'defaultValue', COALESCE(pg_get_expr(d.adbin, d.adrelid), ''),
        'isPrimaryKey', COALESCE(pk.is_pk, false),
        'isUnique', COALESCE(uk.is_unique, false),
        'isForeignKey', COALESCE(fk.is_fk, false)
      )
    ) FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped) as columns
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  LEFT JOIN (
    SELECT a.attrelid, a.attname, true as is_pk
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_index i ON i.indrelid = a.attrelid
    JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
    JOIN pg_catalog.pg_constraint pc ON pc.conindid = i.indexrelid
    WHERE i.indisprimary AND pc.contype = 'p'
    AND a.attnum = ANY(i.indkey)
  ) pk ON pk.attrelid = c.oid AND pk.attname = a.attname
  LEFT JOIN (
    SELECT a.attrelid, a.attname, true as is_unique
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_index i ON i.indrelid = a.attrelid
    WHERE i.indisunique AND NOT i.indisprimary
  ) uk ON uk.attrelid = c.oid AND uk.attname = a.attname
  LEFT JOIN (
    SELECT a.attrelid, a.attname, true as is_fk
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_constraint c ON c.conrelid = a.attrelid
    WHERE c.contype = 'f'
  ) fk ON fk.attrelid = c.oid AND fk.attname = a.attname
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY n.nspname, c.relname
),
-- Get all indexes information
indexes_info AS (
  SELECT
    n.nspname as schema_name,
    c.relname as table_name,
    jsonb_object_agg(
      i.relname,
      jsonb_build_object('indexName', i.relname)
    ) as indexes
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
  JOIN pg_catalog.pg_index idx ON idx.indrelid = c.oid
  JOIN pg_catalog.pg_class i ON i.oid = idx.indexrelid
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY n.nspname, c.relname
),
-- Get all triggers information
triggers_info AS (
  SELECT
    n.nspname as schema_name,
    c.relname as table_name,
    jsonb_object_agg(
      t.tgname,
      jsonb_build_object('triggerName', t.tgname)
    ) as triggers
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = c.oid
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY n.nspname, c.relname
),
-- Get all relations (foreign keys) information
relations_info AS (
  SELECT
    n.nspname as schema_name,
    c.relname as table_name,
    jsonb_object_agg(
      con.conname,
      jsonb_build_object(
        'relationName', con.conname,
        'foreignSchema', fn.nspname,
        'foreignTable', fc.relname,
        'columnMapping', (
          SELECT jsonb_object_agg(
            a.attname,
            fa.attname
          )
          FROM unnest(con.conkey, con.confkey) AS k(key, fkey)
          JOIN pg_attribute a ON a.attnum = k.key AND a.attrelid = con.conrelid
          JOIN pg_attribute fa ON fa.attnum = k.fkey AND fa.attrelid = con.confrelid
        )
      )
    ) as relations
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_namespace n ON n.oid = con.connamespace
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_class fc ON fc.oid = con.confrelid
  JOIN pg_catalog.pg_namespace fn ON fn.oid = fc.relnamespace
  WHERE con.contype = 'f'
  GROUP BY n.nspname, c.relname
),
-- Get table definitions
table_definitions AS (
  SELECT
    n.nspname as schema_name,
    c.relname as table_name,
    format(
      'CREATE TABLE %I.%I (%s)%s;',
      n.nspname,
      c.relname,
      string_agg(
        format(
          '%I %s%s%s',
          a.attname,
          pg_catalog.format_type(a.atttypid, a.atttypmod),
          CASE
            WHEN a.attnotnull THEN ' NOT NULL'
            ELSE ''
          END,
          CASE
            WHEN d.adbin IS NOT NULL
            THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid)
            ELSE ''
          END
        ),
        ', '
      ),
      CASE
        WHEN c.relpersistence = 'u' THEN ' UNLOGGED'
        ELSE ''
      END
    ) as create_sql
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND a.attnum > 0
    AND NOT a.attisdropped
  GROUP BY n.nspname, c.relname, c.relpersistence
),
-- Get all functions
functions_info AS (
  SELECT
    n.nspname as schema_name,
    jsonb_object_agg(
      p.proname || '(' || pg_get_function_arguments(p.oid) || ')',
      jsonb_build_object(
        'functionName', p.proname,
        'arguments', pg_get_function_arguments(p.oid),
        'returnType', pg_get_function_result(p.oid),
        'language', l.lanname
      )
    ) as functions
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY n.nspname
),
-- Get all views with columns
views_info AS (
  SELECT
    n.nspname as schema_name,
    jsonb_object_agg(
      c.relname,
      jsonb_build_object(
        'viewName', c.relname,
        'query', pg_get_viewdef(c.oid, true),
        'columns', (
          SELECT jsonb_object_agg(
            a.attname,
            jsonb_build_object(
              'columnName', a.attname,
              'columnType', format_type(a.atttypid, a.atttypmod),
              'columnComment', COALESCE(col.column_comment, '')
            )
          )
          FROM pg_catalog.pg_attribute a
          LEFT JOIN (
            SELECT objoid, objsubid, description as column_comment
            FROM pg_catalog.pg_description
            WHERE objsubid > 0
          ) col ON col.objoid = c.oid AND col.objsubid = a.attnum
          WHERE a.attrelid = c.oid AND a.attnum > 0
        )
      )
    ) as views
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
  WHERE c.relkind = 'v' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY n.nspname
),
-- Combine table information
tables_info AS (
  SELECT
    c.schema_name,
    jsonb_build_object(
      'expanded', false,
      'tableList', jsonb_object_agg(
        c.table_name,
        jsonb_build_object(
          'tableName', c.table_name,
          'expanded', false,
          'createSql', td.create_sql,
          'columns', jsonb_build_object(
            'expanded', false,
            'columnList', c.columns
          ),
          'indexes', jsonb_build_object(
            'expanded', false,
            'indexList', COALESCE(i.indexes, '{}'::jsonb)
          ),
          'triggers', jsonb_build_object(
            'expanded', false,
            'triggerList', COALESCE(t.triggers, '{}'::jsonb)
          ),
          'relations', jsonb_build_object(
            'expanded', false,
            'relationList', COALESCE(r.relations, '{}'::jsonb)
          )
        )
      )
    ) as tables
  FROM columns_info c
  LEFT JOIN indexes_info i ON i.schema_name = c.schema_name AND i.table_name = c.table_name
  LEFT JOIN triggers_info t ON t.schema_name = c.schema_name AND t.table_name = c.table_name
  LEFT JOIN relations_info r ON r.schema_name = c.schema_name AND r.table_name = c.table_name
  LEFT JOIN table_definitions td ON td.schema_name = c.schema_name AND td.table_name = c.table_name
  GROUP BY c.schema_name
)
-- Final result
SELECT jsonb_build_object(
  'databaseName', current_database(),
  'schemas', jsonb_object_agg(
    sl.schema_name,
    jsonb_build_object(
      'schemaName', sl.schema_name,
      'expanded', false,
      'tables', COALESCE(ti.tables, jsonb_build_object(
        'expanded', false,
        'tableList', '{}'::jsonb
      )),
      'functions', jsonb_build_object(
        'expanded', false,
        'functionList', COALESCE(f.functions, '{}'::jsonb)
      ),
      'procedures', jsonb_build_object(
        'expanded', false,
        'procedureList', '{}'::jsonb
      ),
      'triggers', jsonb_build_object(
        'expanded', false,
        'triggerList', '{}'::jsonb
      ),
      'views', jsonb_build_object(
        'expanded', false,
        'viewList', COALESCE(v.views, '{}'::jsonb)
      )
    )
  )
) as database_structure
FROM schemas_list sl
LEFT JOIN tables_info ti ON ti.schema_name = sl.schema_name
LEFT JOIN functions_info f ON f.schema_name = sl.schema_name
LEFT JOIN views_info v ON v.schema_name = sl.schema_name
GROUP BY sl.schema_name;
`;
function useSelectedDatabaseContext() {
  const { selectedDatabaseContext, databaseContext, dispatch } = useAppContext((state) => ({
    selectedDatabaseContext: state.selectedDatabaseContext,
    databaseContext: state.databaseContext,
    dispatch: state.dispatch
  }));

  const dbQuery = React.useCallback(async (query: string, params?: string[]) => {
    return await window.api.dbQuery(query, params);
  }, []);

  const getSchemas = React.useCallback(async () => {
    const schemas = await window.api.changeDatabase(databaseContext.selectedDatabase);

    const currentSchemas = selectedDatabaseContext.schemas;

    if (Array.isArray(schemas)) {
      const { data, timeCost, error, successMessage } = await dbQuery(dbStructureSql);

      if (error) {
        console.error('Error getting database structure', error);
      }

      if (Array.isArray(data)) {
        const ds = data.reduce((acc, item) => {
          const { schemas } = item.database_structure;

          const schemaNames = Object.keys(schemas);

          const schema = schemaNames.reduce((acc, schemaName) => {
            const { tables, functions, procedures, triggers, views } = schemas[
              schemaName
            ] as (typeof currentSchemas)[keyof typeof currentSchemas];

            if (currentSchemas[schemaName]) {
              const currentSchema = currentSchemas[schemaName];
              return {
                ...acc,
                [schemaName]: {
                  schemaName,
                  expanded: currentSchema.expanded,
                  tables: {
                    expanded: currentSchema.tables.expanded,
                    tableList: Object.values(tables.tableList).reduce(
                      (acc: typeof currentSchema.tables.tableList, table) => {
                        return {
                          ...acc,
                          [table.tableName]: {
                            ...table,
                            expanded: (currentSchema.tables.tableList[table.tableName] || {})
                              .expanded,
                            columns: {
                              expanded: (
                                (currentSchema.tables.tableList[table.tableName] || {}).columns ||
                                {}
                              ).expanded,
                              columnList: tables.tableList[table.tableName].columns.columnList
                            },
                            indexes: {
                              expanded: (
                                (currentSchema.tables.tableList[table.tableName] || {}).indexes ||
                                {}
                              ).expanded,
                              indexList: tables.tableList[table.tableName].indexes.indexList
                            },
                            triggers: {
                              expanded: (
                                (currentSchema.tables.tableList[table.tableName] || {}).triggers ||
                                {}
                              ).expanded,
                              triggerList: tables.tableList[table.tableName].triggers.triggerList
                            },
                            relations: {
                              expanded: (
                                (currentSchema.tables.tableList[table.tableName] || {}).relations ||
                                {}
                              ).expanded,
                              relationList: tables.tableList[table.tableName].relations.relationList
                            }
                          }
                        };
                      },
                      {}
                    )
                  },
                  functions: {
                    expanded: currentSchema.functions.expanded,
                    functionList: functions.functionList
                  },
                  procedures: {
                    expanded: currentSchema.procedures.expanded,
                    procedureList: procedures.procedureList
                  },
                  triggers: {
                    expanded: currentSchema.triggers.expanded,
                    triggerList: triggers.triggerList
                  },
                  views: {
                    expanded: currentSchema.views.expanded,
                    viewList: Object.values(views.viewList).reduce(
                      (acc: typeof currentSchema.views.viewList, view) => {
                        return {
                          ...acc,
                          [view.viewName]: {
                            ...view,
                            expanded: currentSchema.views.viewList[view.viewName].expanded,
                            columns: {
                              expanded:
                                currentSchema.views.viewList[view.viewName].columns.expanded,
                              columnList: views.viewList[view.viewName].columns.columnList
                            }
                          }
                        };
                      },
                      {}
                    )
                  }
                }
              };
            }

            return {
              ...acc,
              [schemaName]: {
                schemaName,
                expanded: false,
                tables,
                functions,
                procedures,
                triggers,
                views
              }
            };
          }, {});

          return {
            ...acc,
            ...schema
          };
        }, {});

        dispatch((state) => ({
          selectedDatabaseContext: {
            ...state.selectedDatabaseContext,
            databaseName: databaseContext.selectedDatabase,
            schemas: ds
          }
        }));
      }
    }
  }, [dbQuery, selectedDatabaseContext.schemas]);

  React.useEffect(() => {
    if (
      databaseContext.selectedDatabase &&
      selectedDatabaseContext.databaseName !== databaseContext.selectedDatabase
    ) {
      getSchemas();
    }
  }, [databaseContext.selectedDatabase, selectedDatabaseContext.databaseName, dbQuery]);

  return {
    ...selectedDatabaseContext,
    reload: getSchemas,
    dbQuery,
    dispatch
  };
}

export default useSelectedDatabaseContext;
