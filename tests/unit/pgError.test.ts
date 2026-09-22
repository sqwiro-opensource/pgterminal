import { describe, expect, it } from 'vitest';
import { DatabaseError } from 'pg-protocol';
import { CANCEL_CODE, isCancelError, positionToLineCol, toPgErrorInfo } from '@main/db/pgError';

function dbError(fields: Partial<Record<string, string>>, message = 'boom'): DatabaseError {
  const e = new DatabaseError(message, 0, 'error');
  Object.assign(e, fields);
  return e;
}

describe('toPgErrorInfo', () => {
  it('copies every structured field from a pg DatabaseError', () => {
    const err = dbError({
      code: '42703',
      severity: 'ERROR',
      detail: 'd',
      hint: 'h',
      position: '15',
      internalPosition: '3',
      internalQuery: 'iq',
      where: 'w',
      schema: 's',
      table: 't',
      column: 'c',
      dataType: 'dt',
      constraint: 'k'
    }, 'column "x" does not exist');
    const info = toPgErrorInfo(err, 'SELECT 1;\nSELECT x FROM t', 1);
    expect(info).toMatchObject({
      message: 'column "x" does not exist',
      code: '42703',
      severity: 'ERROR',
      detail: 'd',
      hint: 'h',
      position: 15,
      internalPosition: 3,
      internalQuery: 'iq',
      where: 'w',
      schema: 's',
      table: 't',
      column: 'c',
      dataType: 'dt',
      constraint: 'k',
      statementIndex: 1
    });
    expect(info.line).toBe(2);
    expect(info.col).toBe(5);
  });

  it('omits undefined fields (serialisable, no junk keys)', () => {
    const info = toPgErrorInfo(dbError({ code: '42601' }, 'syntax error'));
    expect(Object.keys(info).sort()).toEqual(['code', 'message']);
  });

  it('maps socket errors to a code and a friendly hint', () => {
    const e = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const info = toPgErrorInfo(e);
    expect(info.code).toBe('ECONNREFUSED');
    expect(info.hint).toMatch(/Tailscale/);
    expect(toPgErrorInfo(Object.assign(new Error('x'), { code: 'ENOTFOUND' })).hint).toMatch(/host/i);
  });

  it('stringifies non-error values', () => {
    expect(toPgErrorInfo('plain')).toEqual({ message: 'plain' });
    expect(toPgErrorInfo(undefined)).toEqual({ message: 'undefined' });
  });

  it('computes line/col only when both position and text are present', () => {
    const info = toPgErrorInfo(dbError({ position: '4' }));
    expect(info.line).toBeUndefined();
    expect(positionToLineCol('ab\ncd', 4)).toEqual({ line: 2, col: 1 });
    expect(positionToLineCol('ab\ncd', 1)).toEqual({ line: 1, col: 1 });
    expect(positionToLineCol('ab\ncd', 99)).toEqual({ line: 2, col: 3 });
  });
});

describe('isCancelError', () => {
  it('detects SQLSTATE 57014 only', () => {
    expect(isCancelError(dbError({ code: CANCEL_CODE }))).toBe(true);
    expect(isCancelError(dbError({ code: '42601' }))).toBe(false);
    expect(isCancelError(null)).toBe(false);
  });
});
