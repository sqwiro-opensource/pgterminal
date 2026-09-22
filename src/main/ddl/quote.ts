import format from 'pg-format';

/**
 * Quote an identifier for use in generated SQL (pg-format `%I`).
 * Plain lower-case identifiers stay bare; anything else is double-quoted with `"` doubled.
 */
export function quoteIdent(name: string): string {
  return format.ident(name);
}

/** `schema.name`, both parts quoted as needed. */
export function qualify(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

/** Quote a string literal (pg-format `%L`). Only for values that cannot be parameterised (e.g. COMMENT ON). */
export function quoteLiteral(value: string): string {
  return format.literal(value);
}
