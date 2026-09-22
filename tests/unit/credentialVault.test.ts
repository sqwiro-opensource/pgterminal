import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStores, type Stores } from '@main/store/stores';
import { CredentialVault, type SafeStorageLike } from '@main/vault/CredentialVault';

/** Fake safeStorage: reversible xor so we can assert plaintext never hits disk. */
function fakeSafe(opts: { available?: boolean; backend?: string } = {}): SafeStorageLike {
  const key = 0x5a;
  return {
    isEncryptionAvailable: () => opts.available ?? true,
    encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ key)),
    decryptString: (b) => Buffer.from(b.map((x) => x ^ key)).toString('utf8'),
    getSelectedStorageBackend: () => opts.backend ?? 'keychain'
  };
}

describe('CredentialVault', () => {
  let cwd: string;
  let s: Stores;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'pgterminal-vault-'));
    s = getStores({ cwd });
  });

  it('stores and retrieves without writing plaintext', () => {
    const v = new CredentialVault(fakeSafe(), s.vault, 'darwin');
    expect(v.canStore()).toEqual({ ok: true });
    expect(v.set('conn-1', 'Sup3r$ecretPassw0rd')).toEqual({ stored: true });
    expect(v.has('conn-1')).toBe(true);
    expect(v.get('conn-1')).toBe('Sup3r$ecretPassw0rd');
    const raw = readFileSync(join(cwd, 'vault.json'), 'utf8');
    expect(raw).not.toContain('Sup3r$ecretPassw0rd');
    expect(JSON.parse(raw).secrets['conn-1']).toMatch(/^[A-Za-z0-9+/=]+$/);
    // a fresh vault over the same store still decrypts
    expect(new CredentialVault(fakeSafe(), getStores({ cwd }).vault, 'darwin').get('conn-1')).toBe('Sup3r$ecretPassw0rd');
  });

  it('canRead separates "a secret is stored" from "we can still decrypt it"', () => {
    const v = new CredentialVault(fakeSafe(), s.vault, 'darwin');
    v.set('conn-1', 'pw');
    expect(v.canRead('conn-1')).toBe(true);
    expect(v.canRead('missing')).toBe(false);

    // A new key: the entry is still there, the plaintext is gone. This is what a renamed app,
    // a reset keychain or a vault.json from another machine looks like.
    const lostKey: SafeStorageLike = {
      ...fakeSafe(),
      decryptString: () => {
        throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
      }
    };
    const v2 = new CredentialVault(lostKey, getStores({ cwd }).vault, 'darwin');
    expect(v2.has('conn-1')).toBe(true);
    expect(v2.get('conn-1')).toBeNull();
    expect(v2.canRead('conn-1')).toBe(false);

    // Writing a new password makes it readable again without rebuilding the vault.
    const v3 = new CredentialVault(fakeSafe(), getStores({ cwd }).vault, 'darwin');
    v3.set('conn-1', 'pw2');
    expect(v3.canRead('conn-1')).toBe(true);
    expect(v3.get('conn-1')).toBe('pw2');
  });

  it('refuses when encryption is unavailable and writes nothing', () => {
    const v = new CredentialVault(fakeSafe({ available: false }), s.vault, 'darwin');
    const res = v.set('conn-1', 'pw');
    expect(res.stored).toBe(false);
    expect(res.reason).toMatch(/not available/);
    expect(v.has('conn-1')).toBe(false);
    expect(JSON.parse(readFileSync(join(cwd, 'vault.json'), 'utf8')).secrets).toEqual({});
  });

  it('refuses the linux basic_text backend but not elsewhere', () => {
    expect(new CredentialVault(fakeSafe({ backend: 'basic_text' }), s.vault, 'linux').canStore().ok).toBe(false);
    expect(new CredentialVault(fakeSafe({ backend: 'basic_text' }), s.vault, 'darwin').canStore().ok).toBe(true);
    expect(new CredentialVault(fakeSafe({ backend: 'gnome_libsecret' }), s.vault, 'linux').canStore().ok).toBe(true);
  });

  it('delete removes the secret; missing and undecryptable secrets return null', () => {
    const v = new CredentialVault(fakeSafe(), s.vault, 'darwin');
    v.set('a', 'x');
    expect(v.delete('a')).toBe(true);
    expect(v.delete('a')).toBe(false);
    expect(v.get('a')).toBeNull();
    const broken: SafeStorageLike = { ...fakeSafe(), decryptString: () => { throw new Error('bad key'); } };
    const v2 = new CredentialVault(broken, s.vault, 'darwin');
    v2.set('b', 'y');
    expect(v2.get('b')).toBeNull();
  });
});
