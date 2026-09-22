import { describe, expect, it } from 'vitest';
import {
  defaultForm,
  isUriError,
  parseConnectionUri,
  toConnectionInput,
  validateForm
} from '../../../src/renderer/src/features/connections/connectionForm';

describe('parseConnectionUri', () => {
  it('parses a full uri', () => {
    const r = parseConnectionUri('postgres://alice:s3cret@db.example.com:5433/sqwiro?sslmode=require');
    expect(isUriError(r)).toBe(false);
    if (isUriError(r)) return;
    expect(r).toMatchObject({
      host: 'db.example.com',
      port: '5433',
      user: 'alice',
      password: 's3cret',
      askPassword: false,
      defaultDatabase: 'sqwiro',
      sslMode: 'require'
    });
  });
  it('parses without password or port', () => {
    const r = parseConnectionUri('postgresql://bob@localhost/app');
    if (isUriError(r)) throw new Error(r.error);
    expect(r.user).toBe('bob');
    expect(r.password).toBeUndefined();
    expect(r.port).toBeUndefined();
    expect(r.defaultDatabase).toBe('app');
  });
  it('decodes percent-encoded characters', () => {
    const r = parseConnectionUri('postgres://us%40er:p%40ss%3Aword@host/db%20name');
    if (isUriError(r)) throw new Error(r.error);
    expect(r.user).toBe('us@er');
    expect(r.password).toBe('p@ss:word');
    expect(r.defaultDatabase).toBe('db name');
  });
  it('maps sslmode aliases and rejects unknown ones', () => {
    const a = parseConnectionUri('postgres://h/d?sslmode=verify-full');
    if (isUriError(a)) throw new Error(a.error);
    expect(a.sslMode).toBe('verify-full');
    const b = parseConnectionUri('postgres://h/d?sslmode=prefer');
    if (isUriError(b)) throw new Error(b.error);
    expect(b.sslMode).toBe('disable');
    expect(parseConnectionUri('postgres://h/d?sslmode=bogus')).toEqual({ error: 'Unknown sslmode "bogus"' });
  });
  it('rejects non-postgres schemes and missing hosts', () => {
    expect(isUriError(parseConnectionUri('mysql://h/d'))).toBe(true);
    expect(isUriError(parseConnectionUri('postgres:///d'))).toBe(true);
  });
});

describe('validateForm', () => {
  it('accepts the default form with a name', () => {
    expect(validateForm({ ...defaultForm(), name: 'local' }, [])).toEqual({});
  });
  it('rejects port out of range and non-numeric', () => {
    expect(validateForm({ ...defaultForm(), name: 'x', port: '70000' }, []).port).toBeDefined();
    expect(validateForm({ ...defaultForm(), name: 'x', port: '0' }, []).port).toBeDefined();
    expect(validateForm({ ...defaultForm(), name: 'x', port: 'abc' }, []).port).toBeDefined();
  });
  it('rejects empty host and user', () => {
    const e = validateForm({ ...defaultForm(), name: 'x', host: ' ', user: '' }, []);
    expect(e.host).toBeDefined();
    expect(e.user).toBeDefined();
  });
  it('rejects duplicate names case-insensitively', () => {
    expect(validateForm({ ...defaultForm(), name: 'Admin' }, ['admin']).name).toMatch(/exists/);
  });
});

describe('toConnectionInput', () => {
  it('omits the password when ask-every-time is set or empty', () => {
    const base = { ...defaultForm(), name: 'n', password: 'pw' };
    expect(toConnectionInput({ ...base, askPassword: true }).password).toBeUndefined();
    expect(toConnectionInput({ ...base, password: '' }).password).toBeUndefined();
    expect(toConnectionInput(base).password).toBe('pw');
  });
  it('coerces numeric fields and empty group', () => {
    const i = toConnectionInput({ ...defaultForm(), name: 'n', port: '5433', poolMax: '8', group: '  ' });
    expect(i.port).toBe(5433);
    expect(i.poolMax).toBe(8);
    expect(i.group).toBeUndefined();
    expect(i.idleTimeoutMs).toBe(30_000);
  });
});
