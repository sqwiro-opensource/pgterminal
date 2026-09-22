import { useCallback, useMemo, useState } from 'react';
import type { CellValue, FieldInfo } from '@shared/types/query';
import type { RowOp } from '@shared/types/rows';
import * as B from './editBuffer';

/** Stateful wrapper over the pure edit buffer for one grid. */
export function useEditBuffer(fields: FieldInfo[], pkColumns: string[]) {
  const [buffer, setBuffer] = useState<B.EditBuffer>(B.EMPTY_BUFFER);
  const colIndex = useCallback((name: string) => fields.findIndex((f) => f.name === name), [fields]);

  const setCell = useCallback(
    (rowKey: string, original: CellValue[], colName: string, value: CellValue) => {
      const i = colIndex(colName);
      if (i < 0) return;
      setBuffer((b) => B.setCell(b, rowKey, original, i, colName, value));
    },
    [colIndex]
  );
  const revertCell = useCallback((rowKey: string, colName: string) => setBuffer((b) => B.revertCell(b, rowKey, colName)), []);
  const setNull = useCallback((rowKey: string, original: CellValue[], colName: string) => setCell(rowKey, original, colName, null), [setCell]);
  const setDefault = useCallback(
    (rowKey: string, original: CellValue[], colName: string) => {
      const i = colIndex(colName);
      if (i >= 0) setBuffer((b) => B.setDefault(b, rowKey, original, i, colName));
    },
    [colIndex]
  );
  const toggleDelete = useCallback((rowKey: string) => setBuffer((b) => (b.deletes.includes(rowKey) ? B.unmarkDelete(b, rowKey) : B.markDelete(b, rowKey))), []);
  const markDelete = useCallback((rowKeys: string[]) => setBuffer((b) => rowKeys.reduce((acc, k) => B.markDelete(acc, k), b)), []);
  const addInsert = useCallback((values: Record<string, CellValue>) => setBuffer((b) => B.addInsert(b, values)), []);
  const updateInsert = useCallback((index: number, patch: Record<string, CellValue>) => setBuffer((b) => B.updateInsert(b, index, patch)), []);
  const removeInsert = useCallback((index: number) => setBuffer((b) => B.removeInsert(b, index)), []);
  const clear = useCallback(() => setBuffer(B.EMPTY_BUFFER), []);

  const pendingCells = useMemo(() => B.pendingCellKeys(buffer), [buffer]);
  const deletedRows = useMemo(() => new Set(buffer.deletes), [buffer.deletes]);
  const dirty = B.isDirty(buffer);
  const count = B.changeCount(buffer);

  const toOps = useCallback(
    (rowByKey: (key: string) => CellValue[] | undefined): RowOp[] => B.toOpsWithRows(buffer, fields, pkColumns, rowByKey),
    [buffer, fields, pkColumns]
  );

  /** Display value of a cell with the pending edit applied. */
  const displayRow = useCallback(
    (rowKey: string, row: CellValue[]): CellValue[] => {
      const u = buffer.updates[rowKey];
      if (!u) return row;
      const out = row.slice();
      for (const [col, v] of Object.entries(u.set)) {
        const i = colIndex(col);
        if (i >= 0) out[i] = v;
      }
      return out;
    },
    [buffer.updates, colIndex]
  );

  return { buffer, dirty, count, pendingCells, deletedRows, setCell, revertCell, setNull, setDefault, toggleDelete, markDelete, addInsert, updateInsert, removeInsert, clear, toOps, displayRow };
}

export type EditBufferApi = ReturnType<typeof useEditBuffer>;
