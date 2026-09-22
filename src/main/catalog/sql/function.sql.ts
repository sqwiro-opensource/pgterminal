import type { SqlStatement } from './types';

/**
 * Definition of routine `$1`.`$2` whose identity arguments equal `$3`
 * (as produced by pg_get_function_identity_arguments), disambiguating overloads.
 */
export function functionDefinitionSql(schema: string, name: string, identityArgs: string): SqlStatement {
  return {
    text: `
      SELECT p.proname AS name,
             p.prokind::text AS prokind,
             pg_get_function_arguments(p.oid) AS args,
             CASE WHEN p.prokind = 'p' THEN '' ELSE pg_get_function_result(p.oid) END AS returns,
             l.lanname AS language,
             pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1 AND p.proname = $2 AND pg_get_function_identity_arguments(p.oid) = $3
      LIMIT 1`,
    values: [schema, name, identityArgs]
  };
}
