import { describe, expect, it } from 'vitest';
import {
  iconColorFor,
  iconFor,
  isFolderKind,
  KIND_LABEL,
  type IconKind
} from '../../../src/renderer/src/lib/objectIcons';

/** Every kind the tree can draw, mirroring NodeKind plus the two tree-only rows. */
const ALL_KINDS: IconKind[] = [
  'connection',
  'server',
  'database',
  'schema',
  'tablesGroup',
  'viewsGroup',
  'functionsGroup',
  'typesGroup',
  'sequencesGroup',
  'columnsGroup',
  'indexesGroup',
  'constraintsGroup',
  'triggersGroup',
  'extensionsGroup',
  'table',
  'partitionedTable',
  'foreignTable',
  'view',
  'matview',
  'column',
  'index',
  'constraint',
  'trigger',
  'function',
  'procedure',
  'sequence',
  'type',
  'extension'
];

describe('objectIcons', () => {
  it('resolves an icon, a colour and a label for every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(iconFor(kind), kind).toBeTypeOf('object');
      expect(iconColorFor(kind), kind).toMatch(/^text-icon-/);
      expect(KIND_LABEL[kind], kind).toBeTruthy();
    }
  });

  it('gives each object kind a colour of its own', () => {
    // The point of the exercise: a table must not look like a view at a glance.
    const distinct: IconKind[] = [
      'table',
      'partitionedTable',
      'foreignTable',
      'view',
      'matview',
      'function',
      'sequence',
      'type',
      'extension',
      'index',
      'constraint',
      'trigger'
    ];
    const colors = distinct.map((k) => iconColorFor(k));
    expect(new Set(colors).size).toBe(distinct.length);
  });

  it('keeps procedures with functions, since they are the same thing to a reader', () => {
    expect(iconColorFor('procedure')).toBe(iconColorFor('function'));
    expect(iconFor('procedure')).toBe(iconFor('function'));
  });

  it('marks a primary-key column apart from an ordinary one', () => {
    expect(iconFor('column', { pk: true })).not.toBe(iconFor('column'));
    expect(iconColorFor('column', { pk: true })).toBe('text-icon-key');
    expect(iconColorFor('column')).toBe('text-icon-column');
  });

  it('knows which kinds hold others', () => {
    expect(isFolderKind('schema')).toBe(true);
    expect(isFolderKind('tablesGroup')).toBe(true);
    expect(isFolderKind('table')).toBe(false);
  });

  it('shares one icon across the relation kinds but not one colour', () => {
    const relations: IconKind[] = ['table', 'partitionedTable', 'foreignTable'];
    expect(new Set(relations.map((k) => iconFor(k))).size).toBe(1);
    expect(new Set(relations.map((k) => iconColorFor(k))).size).toBe(3);
  });

  it('gives every folder its own icon, distinct from the leaves it holds', () => {
    // Colour alone left Tables, Views and Functions reading as one grey row.
    const folders = [
      'schema', 'tablesGroup', 'viewsGroup', 'functionsGroup', 'typesGroup', 'sequencesGroup',
      'columnsGroup', 'indexesGroup', 'constraintsGroup', 'triggersGroup', 'extensionsGroup'
    ] as const;
    const icons = folders.map((k) => iconFor(k));
    expect(new Set(icons).size).toBe(folders.length);

    // A folder must not wear the same icon as the items inside it.
    const pairs: Array<[(typeof folders)[number], Parameters<typeof iconFor>[0]]> = [
      ['tablesGroup', 'table'],
      ['viewsGroup', 'view'],
      ['functionsGroup', 'function'],
      ['typesGroup', 'type'],
      ['sequencesGroup', 'sequence'],
      ['columnsGroup', 'column'],
      ['indexesGroup', 'index'],
      ['constraintsGroup', 'constraint'],
      ['triggersGroup', 'trigger'],
      ['extensionsGroup', 'extension']
    ];
    for (const [folder, leaf] of pairs) expect(iconFor(folder)).not.toBe(iconFor(leaf));
  });

  it('keeps a folder icon steady when it opens, since the chevron shows that', () => {
    expect(iconFor('tablesGroup', { expanded: true })).toBe(iconFor('tablesGroup'));
    expect(iconFor('schema', { expanded: true })).toBe(iconFor('schema'));
  });
});
