import { useEffect, useState } from 'react';
import { ExternalLink, Table2, Unlink } from 'lucide-react';
import type { DocLinkResolution, DocRef } from '@shared/types/doclink';
import type { CellValue } from '@shared/types/query';
import { formatCell } from '@renderer/lib/format';
import { docLinks, type LinkContext } from './docLinksService';
import { orderFieldsForPreview } from '@renderer/tabs/DocumentTab/documentModel';

export { orderFieldsForPreview };

function cellText(value: CellValue, dataType: string): string {
  const f = formatCell(value, dataType);
  return f.text.length > 60 ? `${f.text.slice(0, 60)}…` : f.text;
}

export interface DocPreviewCardProps {
  ref_: DocRef;
  ctx: LinkContext;
  preferred?: { schema: string; table: string };
  onOpen(newTab: boolean): void;
}

/** Hover card body: resolves through the shared cache and shows the first fields of the target row. */
export function DocPreviewCard({ ref_, ctx, preferred, onOpen }: DocPreviewCardProps): JSX.Element {
  const [res, setRes] = useState<DocLinkResolution | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRes(null);
    setError(null);
    docLinks
      .resolve(ref_, ctx, preferred)
      .then((r) => alive && setRes(r))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [ref_, ctx.connectionId, ctx.database, preferred?.schema, preferred?.table]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-[320px] text-[12px]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Table2 size={14} strokeWidth={1.75} className="text-link" />
        <span className="truncate font-mono text-[12.5px] text-link">{ref_.raw}</span>
        {res?.status === 'found' && (
          <span className="truncate text-[11px] text-muted-foreground">
            {res.target.schema}.{res.target.table}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-accent" onClick={() => onOpen(false)}>
            Open
          </button>
          <button type="button" title="Open in new tab" className="rounded p-1 hover:bg-accent" onClick={() => onOpen(true)}>
            <ExternalLink size={12} strokeWidth={1.75} />
          </button>
        </span>
      </div>
      <div className="px-3 py-2">
        {error && <div className="text-destructive">{error}</div>}
        {!res && !error && (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${80 - i * 15}%` }} />
            ))}
          </div>
        )}
        {res?.status === 'found' && (
          <table className="w-full">
            <tbody>
              {orderFieldsForPreview(res.fields, [res.target.keyColumn]).map((f) => (
                <tr key={f.name} className="align-top">
                  <td className="w-[38%] truncate pr-2 font-mono text-[11px] text-muted-foreground">{f.name}</td>
                  <td className="truncate font-mono text-[11.5px]" title={String(res.row[f.name] ?? '')}>
                    {cellText(res.row[f.name] ?? null, f.dataType)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {res?.status === 'notFound' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Unlink size={14} strokeWidth={1.75} /> Row not found
            {res.candidates.length > 0 && <span className="text-[11px]">in {res.candidates.map((c) => `${c.schema}.${c.table}`).join(', ')}</span>}
          </div>
        )}
        {res?.status === 'ambiguous' && <div className="text-muted-foreground">Ambiguous — {res.candidates.length} tables match. Click to choose.</div>}
        {res?.status === 'invalid' && <div className="text-muted-foreground">Not a document reference</div>}
      </div>
    </div>
  );
}
