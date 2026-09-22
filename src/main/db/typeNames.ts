import type { FieldDef, Pool } from 'pg';
import type { FieldInfo } from '@shared/ipc';

/** Builtin type oids → names, so common result sets need no catalog round trip. */
const BUILTIN: Record<number, string> = {
  16: 'bool',
  17: 'bytea',
  18: 'char',
  19: 'name',
  20: 'int8',
  21: 'int2',
  23: 'int4',
  25: 'text',
  26: 'oid',
  114: 'json',
  142: 'xml',
  600: 'point',
  650: 'cidr',
  700: 'float4',
  701: 'float8',
  705: 'unknown',
  790: 'money',
  829: 'macaddr',
  869: 'inet',
  1000: '_bool',
  1001: '_bytea',
  1005: '_int2',
  1007: '_int4',
  1009: '_text',
  1014: '_bpchar',
  1015: '_varchar',
  1016: '_int8',
  1021: '_float4',
  1022: '_float8',
  1042: 'bpchar',
  1043: 'varchar',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1115: '_timestamp',
  1182: '_date',
  1183: '_time',
  1184: 'timestamptz',
  1185: '_timestamptz',
  1186: 'interval',
  1187: '_interval',
  1231: '_numeric',
  1266: 'timetz',
  1270: '_timetz',
  1700: 'numeric',
  2205: 'regclass',
  2249: 'record',
  2278: 'void',
  2950: 'uuid',
  2951: '_uuid',
  3614: 'tsvector',
  3802: 'jsonb',
  3807: '_jsonb',
  3904: 'int4range',
  3906: 'numrange',
  3908: 'tsrange',
  3910: 'tstzrange',
  3912: 'daterange',
  3926: 'int8range'
};

const cache = new WeakMap<Pool, Map<number, string>>();

/** Resolves pg FieldDefs to FieldInfos, looking up non-builtin oids in pg_type once per pool. */
export async function resolveFieldInfos(pool: Pool | null, fields: readonly FieldDef[]): Promise<FieldInfo[]> {
  let known: Map<number, string> | undefined = pool ? cache.get(pool) : undefined;
  const missing = new Set<number>();
  for (const f of fields) {
    if (BUILTIN[f.dataTypeID] === undefined && !known?.has(f.dataTypeID)) missing.add(f.dataTypeID);
  }
  if (missing.size > 0 && pool) {
    if (!known) {
      known = new Map();
      cache.set(pool, known);
    }
    try {
      const r = await pool.query<{ oid: string; typname: string }>(
        'SELECT oid::text, typname FROM pg_type WHERE oid = ANY($1::oid[])',
        [[...missing]]
      );
      for (const row of r.rows) known.set(Number(row.oid), row.typname);
    } catch {
      // fall through: unknown oids render as their number
    }
  }
  return fields.map((f) => ({
    name: f.name,
    dataTypeID: f.dataTypeID,
    dataType: BUILTIN[f.dataTypeID] ?? known?.get(f.dataTypeID) ?? String(f.dataTypeID),
    tableID: f.tableID,
    columnID: f.columnID
  }));
}
