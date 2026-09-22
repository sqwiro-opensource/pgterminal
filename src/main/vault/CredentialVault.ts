/**
 * Encrypted password storage. Ciphertext (base64 of Electron safeStorage output) lives in
 * vault.json; plaintext never touches disk and never crosses IPC in a response.
 */
import type Store from 'electron-store';
import type { VaultFile } from '@main/store/stores';
import { safeStorage } from 'electron';
import { stores } from '@main/store/stores';

/** Subset of Electron's safeStorage used here; injected so tests can fake it. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export type CanStore = { ok: true } | { ok: false; reason: string };

export class CredentialVault {
  /** Memo for `canRead`, so a lost key costs one failed decrypt per id per session, not one per call. */
  private readonly readable = new Map<string, boolean>();

  constructor(
    private readonly safe: SafeStorageLike,
    private readonly store: Store<VaultFile>,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  canStore(): CanStore {
    if (!this.safe.isEncryptionAvailable()) {
      return { ok: false, reason: 'OS encryption is not available; password kept in memory for this session only' };
    }
    if (this.platform === 'linux' && this.safe.getSelectedStorageBackend?.() === 'basic_text') {
      return {
        ok: false,
        reason: 'Linux keyring backend is basic_text (plaintext); refusing to store the password on disk'
      };
    }
    return { ok: true };
  }

  set(id: string, password: string): { stored: boolean; reason?: string } {
    const can = this.canStore();
    if (!can.ok) return { stored: false, reason: can.reason };
    const cipher = this.safe.encryptString(password).toString('base64');
    this.store.set('secrets', { ...this.store.get('secrets'), [id]: cipher });
    // Re-check rather than assume: encrypting can succeed against a key that will not decrypt.
    this.readable.delete(id);
    return { stored: true };
  }

  get(id: string): string | null {
    const cipher = this.store.get('secrets')[id];
    if (!cipher) return null;
    try {
      return this.safe.decryptString(Buffer.from(cipher, 'base64'));
    } catch (err) {
      console.error(`[vault] failed to decrypt secret for ${id}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  has(id: string): boolean {
    return id in this.store.get('secrets');
  }

  /**
   * True when a secret is stored *and* this machine can still decrypt it.
   *
   * A vault entry written under a different app name, a keychain that was reset, or a vault.json
   * carried from another machine all still answer `has` — but yield nothing. Callers that take
   * that for "we have a password" then connect with none, and the server answers with an
   * unreadable SASL error instead of asking for the password.
   */
  canRead(id: string): boolean {
    if (!this.has(id)) return false;
    const memo = this.readable.get(id);
    if (memo !== undefined) return memo;
    const ok = this.get(id) !== null;
    this.readable.set(id, ok);
    return ok;
  }

  delete(id: string): boolean {
    const secrets = { ...this.store.get('secrets') };
    this.readable.delete(id);
    if (!(id in secrets)) return false;
    delete secrets[id];
    this.store.set('secrets', secrets);
    return true;
  }
}

/** Wires the real Electron safeStorage to the app vault store. Main process only. */
export function createVault(store?: Store<VaultFile>): CredentialVault {
  return new CredentialVault(safeStorage as SafeStorageLike, store ?? stores().vault);
}

export default createVault;
