import { KeyRound, Link2 } from 'lucide-react';
import type { RelationNode } from '@shared/types/catalog';
import { columnBadges, type ColumnBadge } from './structureModel';
import { Badge, Cell, EmptyNote, Row, StructTable } from './parts';

const BADGE_TEXT: Record<ColumnBadge, { text: string; tone: 'muted' | 'ok' | 'warn' | 'info' }> = {
  pk: { text: 'PK', tone: 'warn' },
  fk: { text: 'FK', tone: 'info' },
  unique: { text: 'UNIQUE', tone: 'muted' },
  generated: { text: 'GENERATED', tone: 'ok' },
  'identity-always': { text: 'IDENTITY ALWAYS', tone: 'ok' },
  'identity-default': { text: 'IDENTITY BY DEFAULT', tone: 'ok' }
};

export function Columns({ node }: { node: RelationNode }) {
  const cols = node.columns ?? [];
  if (cols.length === 0) return <EmptyNote>No columns</EmptyNote>;
  return (
    <StructTable headers={['#', 'Name', 'Type', 'Nullable', 'Default', 'Attributes', 'Comment']}>
      {cols.map((c, i) => (
        <Row key={c.name} index={i}>
          <Cell mono muted className="w-10 text-right">
            {c.ordinal}
          </Cell>
          <Cell>
            <span className="inline-flex items-center gap-1.5">
              {c.isPk ? (
                <KeyRound size={12} strokeWidth={1.75} className="text-warning" />
              ) : c.isFk ? (
                <Link2 size={12} strokeWidth={1.75} className="text-link" />
              ) : (
                <span className="inline-block w-3" />
              )}
              <span className="font-medium">{c.name}</span>
            </span>
          </Cell>
          <Cell mono>{c.dataType}</Cell>
          <Cell muted className="text-center">
            {c.nullable ? '✓' : '—'}
          </Cell>
          <Cell mono muted title={c.default ?? undefined}>
            {c.default ?? ''}
          </Cell>
          <Cell>
            <span className="inline-flex flex-wrap gap-1">
              {columnBadges(c)
                .filter((b) => b !== 'pk' && b !== 'fk')
                .map((b) => (
                  <Badge key={b} tone={BADGE_TEXT[b].tone}>
                    {BADGE_TEXT[b].text}
                  </Badge>
                ))}
            </span>
          </Cell>
          <Cell muted title={c.comment ?? undefined}>
            {c.comment ?? ''}
          </Cell>
        </Row>
      ))}
    </StructTable>
  );
}
