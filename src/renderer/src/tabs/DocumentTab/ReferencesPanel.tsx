import { useEffect, useMemo, useState } from 'react';
import { findDocRefs } from '@shared/doclink';
import type { DocLinkResolution } from '@shared/types/doclink';
import type { CellValue, FieldInfo, JsonValue } from '@shared/types/query';
import { classifyType, formatCell } from '@renderer/lib/format';
import { docLinks, type LinkContext } from '@renderer/features/doclink/docLinksService';
import { DocLinkChip } from '@renderer/features/doclink/DocLinkChip';
import { orderFieldsForPreview } from './documentModel';

export interface ReferencesPanelProps {
  fields: FieldInfo[];
  row: Record<string, CellValue>;
  ctx: LinkContext;
}

interface RefRow {
  path: string;
  raw: string;
}

/** Every ref found in the row: top-level string columns and nested jsonb leaves. */
export function collectRowRefs(fields: FieldInfo[], row: Record<string, CellValue>): RefRow[] {
  const out: RefRow[] = [];
  for (const f of fields) {
    const v = row[f.name];
    if (v === null || v === undefined || typeof v !== 'object' && typeof v !== 'string') continue;
    if (typeof v === 'string') {
      if (docLinks.isRef(v)) out.push({ path: f.name, raw: v });
      continue;
    }
    if (classifyType(f.dataType) !== 'json' && !Array.isArray(v)) continue;
    for (const hit of findDocRefs(v as JsonValue)) {
      out.push({ path: `${f.name}${hit.path.replace(/\//g, '.')}`, raw: hit.ref.raw });
    }
  }
  return out;
}

function Label({ raw, ctx }: { raw: string; ctx: LinkContext }): JSX.Element {
  const [res, setRes] = useState<DocLinkResolution | null>(null);
  useEffect(() => {
    let alive = true;
    const ref = docLinks.isRef(raw);
    if (!ref) return;
    docLinks.resolve(ref, ctx).then((r) => alive && setRes(r)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [raw, ctx]);
  if (!res) return <span className="text-muted-foreground">…</span>;
  if (res.status !== 'found') return <span className="text-muted-foreground">{res.status === 'notFound' ? 'row not found' : res.status}</span>;
  const f = orderFieldsForPreview(res.fields, [res.target.keyColumn]).find((x) => !['_id', res.target.keyColumn, 'id'].includes(x.name));
  if (!f) return <span />;
  const text = formatCell(res.row[f.name] ?? null, f.dataType).text;
  return <span className="truncate text-muted-foreground" title={`${f.name}: ${text}`}>{text}</span>;
}

export function ReferencesPanel({ fields, row, ctx }: ReferencesPanelProps): JSX.Element {
  const refs = useMemo(() => collectRowRefs(fields, row), [fields, row]);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-8 items-center gap-2 border-b border-border px-2 text-[12px] font-semibold">
        References <span className="font-normal text-muted-foreground">{refs.length}</span>
        <span className="ml-auto text-[10.5px] font-normal text-muted-foreground">links found in this row</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {refs.length === 0 && <div className="p-2 text-[12px] text-muted-foreground">No links in this document.</div>}
        {refs.map((r, i) => (
          <div key={`${r.path}-${i}`} className="grid h-7 grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-1 text-[12px]">
            <span className="truncate font-mono text-[11px] text-muted-foreground" title={r.path}>
              {r.path}
            </span>
            <DocLinkChip raw={r.raw} connectionId={ctx.connectionId} database={ctx.database} fromTabId={ctx.fromTabId} />
            <Label raw={r.raw} ctx={ctx} />
          </div>
        ))}
      </div>
    </div>
  );
}
