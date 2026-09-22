import { describe, expect, it, vi } from 'vitest';

/**
 * contextBridge exposes `window.pgui` with frozen, non-configurable properties. A Proxy `get`
 * trap must return such values unchanged, so the wrapper has to build a plain object instead.
 * This test reproduces the frozen shape that broke the app at runtime.
 */
describe('getPgui over a contextBridge-shaped object', () => {
  function frozenApi(impl: Record<string, unknown>): Record<string, unknown> {
    const api: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(impl)) {
      Object.defineProperty(api, k, { value: v, writable: false, configurable: false, enumerable: true });
    }
    return Object.freeze(api);
  }

  it('calls a channel and reports rejections to the observer', async () => {
    const api = frozenApi({
      'settings:get': () => Promise.resolve({ ok: true }),
      'connections:connect': () => Promise.reject(new Error('boom')),
      on: () => () => undefined
    });
    vi.stubGlobal('window', { pgui: api });
    const { getPgui, setIpcErrorObserver } = await import('@renderer/lib/ipc');

    await expect(getPgui()['settings:get']()).resolves.toEqual({ ok: true });

    const seen: string[] = [];
    const dispose = setIpcErrorObserver((info) => seen.push(info.channel));
    await expect(getPgui()['connections:connect']({ connectionId: 'c1' })).rejects.toThrow('boom');
    expect(seen).toEqual(['connections:connect']);
    dispose();
    vi.unstubAllGlobals();
  });
});
