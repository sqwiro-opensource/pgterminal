/* Ported from legacy completion.ts — static keyword/function/type/snippet data for SQL completion. Pure data, no imports. */
export interface FunctionEntry { label: string; insertText: string; detail: string; documentation?: string }
export interface SnippetEntry { label: string; insertText: string; detail: string; documentation?: string }
export const LEGACY_KEYWORDS = [
  // Existing keywords plus PostgreSQL specific ones
  'SELECT',
  'FROM',
  'WHERE',
  'MATERIALIZED VIEW',
  'VIEW',
  'CREATE',
  'ALTER',
  'DROP',
  'SCHEMA',
  'TABLE',
  'FUNCTION',
  'PROCEDURE',
  'TRIGGER',
  'BEFORE',
  'AFTER',
  'INSTEAD OF',
  'FOR EACH ROW',
  'FOR EACH STATEMENT',
  'RETURNS',
  'RETURN',
  'RETURNS TRIGGER',
  'LANGUAGE',
  'PLPGSQL',
  'SQL',
  'VOLATILE',
  'STABLE',
  'IMMUTABLE',
  'PARTITION BY',
  'USING',
  'INDEX',
  'UNIQUE',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'REFERENCES',
  'CASCADE',
  'SET NULL',
  'CHECK',
  'CONSTRAINT'
]

export const POSTGRES_FUNCTIONS: FunctionEntry[] = [
  // Aggregate Functions
  {
    label: 'COUNT',
    insertText: 'COUNT(${1:*})',
    detail: 'Aggregate - Count rows',
    documentation: 'Returns the number of rows in a group'
  },
  {
    label: 'SUM',
    insertText: 'SUM(${1:column})',
    detail: 'Aggregate - Sum values',
    documentation: 'Returns sum of values in a group'
  },
  {
    label: 'AVG',
    insertText: 'AVG(${1:column})',
    detail: 'Aggregate - Average value',
    documentation: 'Returns average value in a group'
  },
  {
    label: 'MAX',
    insertText: 'MAX(${1:column})',
    detail: 'Aggregate - Maximum value',
    documentation: 'Returns maximum value in a group'
  },
  {
    label: 'MIN',
    insertText: 'MIN(${1:column})',
    detail: 'Aggregate - Minimum value',
    documentation: 'Returns minimum value in a group'
  },
  {
    label: 'array_agg',
    insertText: 'array_agg(${1:column})',
    detail: 'Aggregate - Array of values',
    documentation: 'Returns array of values from grouped rows'
  },
  {
    label: 'string_agg',
    insertText: "string_agg(${1:column}, ${2:','})",
    detail: 'Aggregate - Concatenated string',
    documentation: 'Concatenates values from grouped rows with delimiter'
  },
  {
    label: 'json_agg',
    insertText: 'json_agg(${1:column})',
    detail: 'Aggregate - JSON array',
    documentation: 'Returns JSON array of values from grouped rows'
  },
  {
    label: 'jsonb_agg',
    insertText: 'jsonb_agg(${1:column})',
    detail: 'Aggregate - JSONB array',
    documentation: 'Returns JSONB array of values from grouped rows'
  },
  {
    label: 'bool_and',
    insertText: 'bool_and(${1:column})',
    detail: 'Aggregate - Boolean AND',
    documentation: 'Returns true if all values are true'
  },
  {
    label: 'bool_or',
    insertText: 'bool_or(${1:column})',
    detail: 'Aggregate - Boolean OR',
    documentation: 'Returns true if any value is true'
  },
  {
    label: 'every',
    insertText: 'every(${1:column})',
    detail: 'Aggregate - Boolean every',
    documentation: 'Returns true if all values are true (same as bool_and)'
  },
  {
    label: 'stddev',
    insertText: 'stddev(${1:column})',
    detail: 'Aggregate - Standard deviation',
    documentation: 'Returns sample standard deviation'
  },
  {
    label: 'variance',
    insertText: 'variance(${1:column})',
    detail: 'Aggregate - Variance',
    documentation: 'Returns sample variance'
  },

  // Window Functions
  {
    label: 'row_number',
    insertText: 'row_number() OVER (${1:PARTITION BY ${2:column} ORDER BY ${3:column}})',
    detail: 'Window - Row number',
    documentation: 'Returns sequential row number within partition'
  },
  {
    label: 'rank',
    insertText: 'rank() OVER (${1:PARTITION BY ${2:column} ORDER BY ${3:column}})',
    detail: 'Window - Rank with gaps',
    documentation: 'Returns rank with gaps within partition'
  },
  {
    label: 'dense_rank',
    insertText: 'dense_rank() OVER (${1:PARTITION BY ${2:column} ORDER BY ${3:column}})',
    detail: 'Window - Rank without gaps',
    documentation: 'Returns rank without gaps within partition'
  },
  {
    label: 'first_value',
    insertText:
      'first_value(${1:column}) OVER (${2:PARTITION BY ${3:column} ORDER BY ${4:column}})',
    detail: 'Window - First value',
    documentation: 'Returns first value in window frame'
  },
  {
    label: 'last_value',
    insertText: 'last_value(${1:column}) OVER (${2:PARTITION BY ${3:column} ORDER BY ${4:column}})',
    detail: 'Window - Last value',
    documentation: 'Returns last value in window frame'
  },
  {
    label: 'lag',
    insertText: 'lag(${1:column}${2:, offset}${3:, default}) OVER (${4:ORDER BY ${5:column}})',
    detail: 'Window - Previous row value',
    documentation: 'Returns value from previous row in partition'
  },
  {
    label: 'lead',
    insertText: 'lead(${1:column}${2:, offset}${3:, default}) OVER (${4:ORDER BY ${5:column}})',
    detail: 'Window - Next row value',
    documentation: 'Returns value from next row in partition'
  },
  {
    label: 'nth_value',
    insertText: 'nth_value(${1:column}, ${2:n}) OVER (${3:ORDER BY ${4:column}})',
    detail: 'Window - Nth value',
    documentation: 'Returns value from nth row of window frame'
  },
  {
    label: 'ntile',
    insertText: 'ntile(${1:n}) OVER (${2:ORDER BY ${3:column}})',
    detail: 'Window - Ntile',
    documentation: 'Divides rows into n groups'
  },
  {
    label: 'percent_rank',
    insertText: 'percent_rank() OVER (${1:ORDER BY ${2:column}})',
    detail: 'Window - Percent rank',
    documentation: 'Returns relative rank between 0 and 1'
  },
  {
    label: 'cume_dist',
    insertText: 'cume_dist() OVER (${1:ORDER BY ${2:column}})',
    detail: 'Window - Cumulative distribution',
    documentation: 'Returns cumulative distribution between 0 and 1'
  },

  // String Functions
  {
    label: 'concat',
    insertText: 'concat(${1:str1}, ${2:str2})',
    detail: 'String - Concatenation',
    documentation: 'Concatenates strings'
  },
  {
    label: 'concat_ws',
    insertText: 'concat_ws(${1:separator}, ${2:str1}, ${3:str2})',
    detail: 'String - Concatenation with separator',
    documentation: 'Concatenates strings with separator'
  },
  {
    label: 'format',
    insertText: 'format(${1:formatstr}, ${2:formatarg})',
    detail: 'String - Formatting',
    documentation: 'Formats string like sprintf'
  },
  {
    label: 'left',
    insertText: 'left(${1:str}, ${2:n})',
    detail: 'String - Left substring',
    documentation: 'Returns first n characters'
  },
  {
    label: 'right',
    insertText: 'right(${1:str}, ${2:n})',
    detail: 'String - Right substring',
    documentation: 'Returns last n characters'
  },
  {
    label: 'lower',
    insertText: 'lower(${1:string})',
    detail: 'String - Lowercase',
    documentation: 'Converts string to lowercase'
  },
  {
    label: 'upper',
    insertText: 'upper(${1:string})',
    detail: 'String - Uppercase',
    documentation: 'Converts string to uppercase'
  },
  {
    label: 'lpad',
    insertText: 'lpad(${1:string}, ${2:length}, ${3:fill})',
    detail: 'String - Left pad',
    documentation: 'Left-pad string to length'
  },
  {
    label: 'rpad',
    insertText: 'rpad(${1:string}, ${2:length}, ${3:fill})',
    detail: 'String - Right pad',
    documentation: 'Right-pad string to length'
  },
  {
    label: 'ltrim',
    insertText: 'ltrim(${1:string}${2:, characters})',
    detail: 'String - Left trim',
    documentation: 'Removes specified characters from start of string'
  },
  {
    label: 'rtrim',
    insertText: 'rtrim(${1:string}${2:, characters})',
    detail: 'String - Right trim',
    documentation: 'Removes specified characters from end of string'
  },
  {
    label: 'trim',
    insertText: 'trim(${1:string})',
    detail: 'String - Trim both sides',
    documentation: 'Removes whitespace from both ends of string'
  },
  {
    label: 'regexp_replace',
    insertText: 'regexp_replace(${1:source}, ${2:pattern}, ${3:replacement}${4:, flags})',
    detail: 'String - Regex replace',
    documentation: 'Replaces substring matching regex'
  },
  {
    label: 'regexp_match',
    insertText: 'regexp_match(${1:string}, ${2:pattern})',
    detail: 'String - Regex match',
    documentation: 'Returns captured substring(s)'
  },
  {
    label: 'split_part',
    insertText: 'split_part(${1:string}, ${2:delimiter}, ${3:field})',
    detail: 'String - Split',
    documentation: 'Splits string on delimiter and returns nth field'
  },
  {
    label: 'initcap',
    insertText: 'initcap(${1:string})',
    detail: 'String - Initial capital',
    documentation: 'Converts first letter of each word to uppercase'
  }
]

export const POSTGRES_TYPES = [
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'DECIMAL',
  'NUMERIC',
  'REAL',
  'DOUBLE PRECISION',
  'SERIAL',
  'BIGSERIAL',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'BYTEA',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'DATE',
  'TIME',
  'INTERVAL',
  'BOOLEAN',
  'ENUM',
  'POINT',
  'LINE',
  'LSEG',
  'BOX',
  'PATH',
  'POLYGON',
  'CIRCLE',
  'CIDR',
  'INET',
  'MACADDR',
  'BIT',
  'BIT VARYING',
  'UUID',
  'XML',
  'JSON',
  'JSONB'
]

export const POSTGRES_SNIPPETS: SnippetEntry[] = [
  {
    label: 'CREATE TABLE',
    insertText: [
      'CREATE TABLE ${1:table_name} (',
      '    ${2:column_name} ${3:data_type} ${4:constraints},',
      '    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,',
      '    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
      ');'
    ].join('\n'),
    detail: 'Create new table template'
  },
  {
    label: 'CREATE FUNCTION',
    insertText: [
      'CREATE OR REPLACE FUNCTION ${1:function_name}(${2:parameters})',
      '    RETURNS ${3:return_type}',
      '    LANGUAGE plpgsql',
      '    AS $$',
      'BEGIN',
      '    ${4:-- function body}',
      '    RETURN ${5:value};',
      'END;',
      '$$;'
    ].join('\n'),
    detail: 'Create new function template'
  },
  {
    label: 'CREATE TRIGGER',
    insertText: [
      'CREATE TRIGGER ${1:trigger_name}',
      '    ${2|BEFORE,AFTER,INSTEAD OF|} ${3|INSERT,UPDATE,DELETE|}',
      '    ON ${4:table_name}',
      '    FOR EACH ${5|ROW,STATEMENT|}',
      '    EXECUTE FUNCTION ${6:trigger_function}();'
    ].join('\n'),
    detail: 'Create new trigger template'
  },
  {
    label: 'CREATE VIEW',
    insertText: [
      'CREATE OR REPLACE VIEW ${1:view_name} AS',
      'SELECT ${2:columns}',
      'FROM ${3:table_name}',
      'WHERE ${4:conditions};'
    ].join('\n'),
    detail: 'Create new view template'
  },
  {
    label: 'CREATE MATERIALIZED VIEW',
    insertText: [
      'CREATE MATERIALIZED VIEW ${1:view_name}',
      'AS',
      'SELECT ${2:columns}',
      'FROM ${3:table_name}',
      'WHERE ${4:conditions}',
      'WITH DATA;'
    ].join('\n'),
    detail: 'Create new materialized view template'
  },
  {
    label: 'CREATE INDEX',
    insertText: ['CREATE INDEX ${1:index_name}', 'ON ${2:table_name} (${3:column_name});'].join(
      '\n'
    ),
    detail: 'Create new index template'
  },
  {
    label: 'CREATE UNIQUE INDEX',
    insertText: [
      'CREATE UNIQUE INDEX ${1:index_name}',
      'ON ${2:table_name} (${3:column_name});'
    ].join('\n'),
    detail: 'Create unique index template'
  },
  {
    label: 'ALTER TABLE',
    insertText: [
      'ALTER TABLE ${1:table_name}',
      '    ${2|ADD COLUMN,DROP COLUMN,ALTER COLUMN,ADD CONSTRAINT,DROP CONSTRAINT|} ${3:name} ${4:definition};'
    ].join('\n'),
    detail: 'Alter table template'
  },
  {
    label: 'CREATE EXTENSION',
    insertText: ['CREATE EXTENSION IF NOT EXISTS ${1:extension_name};'].join('\n'),
    detail: 'Create extension template'
  },
  {
    label: 'BEGIN TRANSACTION',
    insertText: ['BEGIN;', '${1:-- transaction content}', 'COMMIT;'].join('\n'),
    detail: 'Transaction block template'
  },
  {
    label: 'PLPGSQL FUNCTION',
    insertText: [
      'CREATE OR REPLACE FUNCTION ${1:function_name}(${2:parameters})',
      'RETURNS ${3:return_type}',
      'LANGUAGE plpgsql',
      'AS $$',
      'DECLARE',
      '    ${4:variable_name} ${5:data_type};',
      'BEGIN',
      '    ${6:-- function body}',
      '    RETURN ${7:value};',
      'EXCEPTION',
      '    WHEN OTHERS THEN',
      '        -- Handle exception',
      "        RAISE NOTICE 'Error: %', SQLERRM;",
      '        RETURN NULL;',
      'END;',
      '$$;'
    ].join('\n'),
    detail: 'PL/pgSQL function with error handling template'
  },
  {
    label: 'TRIGGER FUNCTION',
    insertText: [
      'CREATE OR REPLACE FUNCTION ${1:trigger_function_name}()',
      'RETURNS TRIGGER',
      'LANGUAGE plpgsql',
      'AS $$',
      'BEGIN',
      "    IF (TG_OP = 'DELETE') THEN",
      '        ${2:-- handle DELETE}',
      '        RETURN OLD;',
      "    ELSIF (TG_OP = 'UPDATE') THEN",
      '        ${3:-- handle UPDATE}',
      '        RETURN NEW;',
      "    ELSIF (TG_OP = 'INSERT') THEN",
      '        ${4:-- handle INSERT}',
      '        RETURN NEW;',
      '    END IF;',
      '    RETURN NULL;',
      'END;',
      '$$;'
    ].join('\n'),
    detail: 'Trigger function template with operation handling'
  }
]

/** Keywords offered in keyword context; the legacy list plus the everyday DML/DQL vocabulary. */
export const POSTGRES_KEYWORDS: string[] = Array.from(
  new Set([
    'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS NULL',
    'IS NOT NULL', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'INNER JOIN', 'LEFT JOIN',
    'RIGHT JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'LATERAL', 'ON', 'USING', 'AS', 'ASC', 'DESC', 'NULLS FIRST',
    'NULLS LAST', 'UNION', 'UNION ALL', 'EXCEPT', 'INTERSECT', 'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE',
    'END', 'CAST', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'RETURNING', 'ON CONFLICT',
    'DO NOTHING', 'DO UPDATE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'EXPLAIN', 'EXPLAIN ANALYZE',
    'TRUNCATE', 'DEFAULT', 'NULL', 'TRUE', 'FALSE', 'ANY', 'ALL', 'SOME', 'ARRAY', 'ROW', 'FILTER', 'OVER',
    'PARTITION BY', 'WINDOW', 'TABLESAMPLE', 'FOR UPDATE', 'FOR SHARE', 'SKIP LOCKED', 'NOWAIT', 'IF EXISTS',
    'IF NOT EXISTS', 'TEMPORARY', 'OWNER TO', 'RENAME TO', 'ADD COLUMN', 'DROP COLUMN', 'ALTER COLUMN',
    'ADD CONSTRAINT', 'DROP CONSTRAINT', 'GENERATED', 'ALWAYS', 'IDENTITY', 'STORED', 'NOT NULL', 'COLLATE',
    'COMMENT ON', 'GRANT', 'REVOKE', 'VACUUM', 'ANALYZE', 'REINDEX', 'CONCURRENTLY', 'MATERIALIZED',
    'REFRESH MATERIALIZED VIEW',
    ...LEGACY_KEYWORDS
  ])
);
