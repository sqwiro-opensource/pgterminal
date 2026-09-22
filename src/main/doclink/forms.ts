/**
 * The raw strings a reference to `schema.table/key` may take in stored values:
 * `table/key`, the fleet convention `schema_table/key`, the prefix-stripped form when the
 * table already starts with `schema_`, and the explicit `schema.table/key`.
 */
export function referenceForms(target: { schema: string; table: string; keyValue: string }): string[] {
  const forms = new Set<string>();
  // When the key column is `_id` the key value is already a full `schema_table/key` reference.
  const slash = target.keyValue.lastIndexOf('/');
  const key = slash >= 0 ? target.keyValue.slice(slash + 1) : target.keyValue;
  if (slash >= 0) forms.add(target.keyValue);
  forms.add(`${target.table}/${key}`);
  forms.add(`${target.schema}_${target.table}/${key}`);
  if (target.table.startsWith(`${target.schema}_`)) forms.add(`${target.table.slice(target.schema.length + 1)}/${key}`);
  forms.add(`${target.schema}.${target.table}/${key}`);
  return [...forms];
}
