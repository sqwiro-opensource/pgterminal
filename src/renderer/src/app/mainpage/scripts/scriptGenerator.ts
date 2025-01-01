export const createTableSqlScript = (schema: string, tableName: string) => {
  const getTableCreateSql = `
    WITH table_definition AS (
        SELECT
            -- Get table drop statement
            '-- DROP TABLE IF EXISTS ' || table_schema || '.' || table_name || ';' || E'\n\n' ||

            -- Get table creation statement with all columns
            'CREATE TABLE IF NOT EXISTS ' || table_schema || '.' || table_name || E'\n(\n' ||

            -- Get columns
            string_agg(
                '    "' || column_name || '" ' ||
                data_type ||
                CASE
                    WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
                    WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL THEN
                        '(' || numeric_precision || COALESCE(',' || numeric_scale, '') || ')'
                    ELSE ''
                END ||
                CASE WHEN collation_name IS NOT NULL THEN ' COLLATE ' || collation_name ELSE '' END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
                E',\n'
            ) ||

            -- Get constraints
            COALESCE((
                SELECT E',\n' || string_agg(
                    '    CONSTRAINT "' || constraint_name || '" ' || constraint_definition,
                    E',\n'
                )
                FROM (
                    SELECT
                        pgc.conname as constraint_name,
                        pg_get_constraintdef(pgc.oid) as constraint_definition
                    FROM pg_constraint pgc
                    JOIN pg_namespace nsp ON nsp.oid = pgc.connamespace
                    WHERE conrelid = (quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass
                ) constraints
            ), '') ||

            -- Close creation statement
            E'\n)\nTABLESPACE pg_default;' ||

            -- Add owner
            E'\n\nALTER TABLE IF EXISTS ' || table_schema || '.' || table_name ||
            ' OWNER to postgres;' as definition
        FROM information_schema.columns
        WHERE table_schema = '${schema}'
          AND table_name = '${tableName}'
        GROUP BY table_schema, table_name
    ),
      indexes AS (
              SELECT string_agg(
                  E'\n-- Index: ' || indexname || E'\n\n' ||
                  E'-- DROP INDEX IF EXISTS ' || schemaname || '.' || indexname || E';\n\n' ||
                  regexp_replace(
                      indexdef,
                      'CREATE (UNIQUE )?INDEX',
                      'CREATE \\1INDEX IF NOT EXISTS',
                      'g'
                  ) || E';\n',
                  E'\n'
              ) as index_definitions
              FROM pg_indexes
              WHERE schemaname = '${schema}'
              AND tablename = '${tableName}'
              AND indexname NOT IN (
                  SELECT constraint_name
                  FROM information_schema.table_constraints
                  WHERE table_schema = '${schema}'
                  AND table_name = '${tableName}'
                  AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
              )
              GROUP BY schemaname, tablename
          ),
    triggers AS (
        SELECT string_agg(
            E'\n-- Trigger: ' || trigger_name || E'\n\n' ||
            E'-- DROP TRIGGER IF EXISTS ' || trigger_name || ' ON ' || event_object_schema || '.' || event_object_table || E';\n\n' ||
            'CREATE OR REPLACE TRIGGER ' || trigger_name || E'\n    ' ||
            action_timing || ' ' || event_manipulation || E'\n    ' ||
            'ON ' || event_object_schema || '.' || event_object_table || E'\n    ' ||
            CASE
                WHEN action_orientation = 'ROW' THEN 'FOR EACH ROW'
                ELSE 'FOR EACH STATEMENT'
            END || E'\n    ' ||
            action_statement || E';\n',
            E'\n'
        ) as trigger_definitions
        FROM information_schema.triggers
        WHERE event_object_schema = '${schema}'
        AND event_object_table = '${tableName}'
        GROUP BY event_object_schema, event_object_table
    )
    SELECT
        COALESCE(table_definition.definition, '') ||
        COALESCE(E'\n\n' || indexes.index_definitions, '') ||
        COALESCE(E'\n\n' || triggers.trigger_definitions, '')
    FROM table_definition
    LEFT JOIN indexes ON true
    LEFT JOIN triggers ON true;
  `;

  return getTableCreateSql;
};

export const createIndexSqlScript = (schema: string, tableName: string, indexName: string) => {
  const getIndexCreateSql = `
    SELECT
      E'-- Index: ' || indexname || E'\n\n' ||
      E'-- DROP INDEX IF EXISTS ' || schemaname || '.' || indexname || E';\n\n' ||
      regexp_replace(
          indexdef,
          'CREATE (UNIQUE )?INDEX',
          'CREATE \\1INDEX IF NOT EXISTS',
          'g'
      ) || E';'
    FROM pg_indexes
    WHERE schemaname = '${schema}'
      AND tablename = '${tableName}'
      AND indexname = '${indexName}';
  `;

  return getIndexCreateSql;
};

export const createTriggerSqlScript = (schema: string, tableName: string, triggerName: string) => {
  const getTriggerCreateSql = `
    SELECT
      E'-- Trigger: ' || trigger_name || E'\n\n' ||
      E'-- DROP TRIGGER IF EXISTS ' || trigger_name || ' ON ' || event_object_schema || '.' || event_object_table || E';\n\n' ||
      'CREATE OR REPLACE TRIGGER ' || trigger_name || E'\n    ' ||
      action_timing || ' ' || event_manipulation || E'\n    ' ||
      'ON ' || event_object_schema || '.' || event_object_table || E'\n    ' ||
      CASE
          WHEN action_orientation = 'ROW' THEN 'FOR EACH ROW'
          ELSE 'FOR EACH STATEMENT'
      END || E'\n    ' ||
      action_statement || E';'
    FROM information_schema.triggers
    WHERE event_object_schema = '${schema}'
      AND event_object_table = '${tableName}'
      AND trigger_name = '${triggerName}';
  `;

  return getTriggerCreateSql;
};

export const createColumnSqlScript = (schema: string, tableName: string, columnName: string) => {
  const getColumnCreateSql = `
    WITH column_def AS (
      SELECT
        E'-- Column: ' || table_schema || '.' || table_name || '.' || column_name || E'\n\n' ||
        E'-- DROP COLUMN IF EXISTS ' || column_name || E';\n\n' ||
        'ALTER TABLE IF EXISTS ' || table_schema || '.' || table_name ||
        ' ADD COLUMN IF NOT EXISTS "' || column_name || '" ' ||
        data_type ||
        CASE
          WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
          WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL THEN
            '(' || numeric_precision || COALESCE(',' || numeric_scale, '') || ')'
          ELSE ''
        END ||
        CASE WHEN collation_name IS NOT NULL THEN ' COLLATE ' || collation_name ELSE '' END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END ||
        E';' as definition
      FROM information_schema.columns
      WHERE table_schema = '${schema}'
        AND table_name = '${tableName}'
        AND column_name = '${columnName}'
    ),
    column_comments AS (
      SELECT
        E'\n\nCOMMENT ON COLUMN ' || table_schema || '.' || table_name || '."' || column_name ||
        '" IS ' || quote_literal(col_description(
          (table_schema || '.' || table_name)::regclass::oid,
          ordinal_position
        )) || E';' as comment_sql
      FROM information_schema.columns
      WHERE table_schema = '${schema}'
        AND table_name = '${tableName}'
        AND column_name = '${columnName}'
        AND col_description(
          (table_schema || '.' || table_name)::regclass::oid,
          ordinal_position
        ) IS NOT NULL
    )
    SELECT
      column_def.definition ||
      COALESCE(column_comments.comment_sql, '')
    FROM column_def
    LEFT JOIN column_comments ON true;
  `;

  return getColumnCreateSql;
};

export const createFunctionSqlScript = (schema: string, functionName: string) => {
  const getFunctionCreateSql = `
    SELECT
      E'-- FUNCTION: ' || n.nspname || '.' || p.proname || '(' ||
      pg_get_function_arguments(p.oid) || E')\n\n' ||
      E'-- DROP FUNCTION IF EXISTS ' || n.nspname || '.' || p.proname ||
      '(' || pg_get_function_arguments(p.oid) || E');\n\n' ||
      E'CREATE OR REPLACE FUNCTION ' || n.nspname || '.' || p.proname ||
      '(' || pg_get_function_arguments(p.oid) || E')\n' ||
      E'    RETURNS ' || pg_get_function_result(p.oid) || E'\n' ||
      E'    LANGUAGE ' || quote_literal(l.lanname) || E'\n' ||
      E'    COST ' || p.procost || E'\n' ||
      CASE
        WHEN p.provolatile = 'i' THEN E'    IMMUTABLE'
        WHEN p.provolatile = 's' THEN E'    STABLE'
        ELSE E'    VOLATILE'
      END ||
      CASE
        WHEN p.proparallel = 'r' THEN E' PARALLEL RESTRICTED'
        WHEN p.proparallel = 's' THEN E' PARALLEL SAFE'
        WHEN p.proparallel = 'u' THEN E' PARALLEL UNSAFE'
        ELSE ''
      END || E'\n' ||
      E'AS $BODY$\n' ||
      convert_from(p.prosrc::bytea, 'UTF8') ||
      E'\n$BODY$;\n\n' ||
      E'ALTER FUNCTION ' || n.nspname || '.' || p.proname ||
      '(' || pg_get_function_arguments(p.oid) || E')\n' ||
      E'    OWNER TO ' || pg_get_userbyid(p.proowner) || E';'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = '${schema}'
      AND p.proname = '${functionName}'
  `;

  return getFunctionCreateSql.replace(/\bCREATE\s+\n\s*OR/, 'CREATE OR');
};
