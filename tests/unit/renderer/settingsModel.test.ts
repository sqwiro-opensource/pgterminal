import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/types/settings';
import {
  clampNumeric,
  confirmEnvs,
  exportConnections,
  parseConnectionImport,
  SECTIONS,
  SECTION_LABELS,
  toggleEnv
} from '../../../src/renderer/src/tabs/SettingsTab/settingsModel';

describe('settingsModel', () => {
  it('labels every section', () => {
    for (const s of SECTIONS) expect(SECTION_LABELS[s]).toBeTruthy();
    expect(SECTIONS).toHaveLength(9);
  });

  describe('clampNumeric', () => {
    it('clamps into the allowed range', () => {
      expect(clampNumeric('editorFontSize', 99)).toBe(18);
      expect(clampNumeric('editorFontSize', 2)).toBe(11);
      expect(clampNumeric('queryRowCap', 500_000)).toBe(200_000);
      expect(clampNumeric('historyMax', 42)).toBe(100);
    });

    it('rounds and keeps in-range values', () => {
      expect(clampNumeric('editorTabSize', 4)).toBe(4);
      expect(clampNumeric('linkHoverDelayMs', 250.6)).toBe(251);
    });

    it('falls back to the default when the input is not a number', () => {
      expect(clampNumeric('queryRowCap', Number.NaN)).toBe(DEFAULT_SETTINGS.queryRowCap);
      expect(clampNumeric('statementTimeoutMs', Number.POSITIVE_INFINITY)).toBe(DEFAULT_SETTINGS.statementTimeoutMs);
    });

    it('allows zero where the range permits it', () => {
      expect(clampNumeric('statementTimeoutMs', 0)).toBe(0);
      expect(clampNumeric('linkHoverDelayMs', 0)).toBe(0);
    });
  });

  describe('confirmOnEnv', () => {
    it('keeps the canonical order when toggling', () => {
      expect(toggleEnv(['prod'], 'dev')).toEqual(['prod', 'dev']);
      expect(toggleEnv(['dev'], 'prod')).toEqual(['prod', 'dev']);
      expect(toggleEnv(['prod', 'dev'], 'prod')).toEqual(['dev']);
    });

    it('askConfirmAllEnvs covers every environment', () => {
      const base: AppSettings = { ...DEFAULT_SETTINGS, confirmOnEnv: ['prod'] };
      expect(confirmEnvs(base)).toEqual(['prod']);
      expect(confirmEnvs({ ...base, askConfirmAllEnvs: true })).toEqual(['prod', 'staging', 'dev', 'local']);
    });
  });

  describe('exportConnections', () => {
    it('never exports a password, id or timestamps', () => {
      const out = exportConnections([
        {
          id: 'uuid-1',
          name: 'adminserver',
          host: 'admin.example',
          port: 5432,
          user: 'postgres',
          defaultDatabase: 'sqwiro',
          sslMode: 'require',
          env: 'prod',
          readOnly: false,
          poolMax: 4,
          idleTimeoutMs: 30_000,
          statementTimeoutMs: 0,
          connectTimeoutMs: 5_000,
          hasPassword: true,
          password: 'hunter2',
          createdAt: 1,
          updatedAt: 2
        }
      ]);
      expect(out).toHaveLength(1);
      const json = JSON.stringify(out);
      expect(json).not.toContain('hunter2');
      expect(json).not.toContain('password');
      expect(out[0]).not.toHaveProperty('id');
      expect(out[0]).not.toHaveProperty('hasPassword');
      expect(out[0]).not.toHaveProperty('createdAt');
      expect(out[0]).toMatchObject({ name: 'adminserver', host: 'admin.example', port: 5432, env: 'prod' });
    });

    it('omits absent optional fields', () => {
      const out = exportConnections([{ name: 'local', host: '127.0.0.1', port: 5432 }]);
      expect(out[0]).not.toHaveProperty('group');
      expect(Object.keys(out[0] ?? {})).toEqual(['name', 'host', 'port']);
    });
  });

  describe('parseConnectionImport', () => {
    it('accepts an array and a single object', () => {
      expect(parseConnectionImport('[{"name":"a","host":"h"}]')).toHaveLength(1);
      expect(parseConnectionImport('{"name":"a","host":"h"}')).toHaveLength(1);
    });

    it('rejects malformed input with a readable message', () => {
      expect(() => parseConnectionImport('not json')).toThrow(/valid JSON/i);
      expect(() => parseConnectionImport('[1]')).toThrow(/must be an object/i);
      expect(() => parseConnectionImport('[{"host":"h"}]')).toThrow(/needs a name/i);
      expect(() => parseConnectionImport('[{"name":"a"}]')).toThrow(/no host/i);
    });

    it('round-trips an export', () => {
      const exported = exportConnections([{ name: 'a', host: 'h', port: 5432, env: 'dev' }]);
      expect(parseConnectionImport(JSON.stringify(exported))).toEqual(exported);
    });
  });
});
