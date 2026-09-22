import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyLabel, copyText, resolveCopyValue } from '../../../src/renderer/src/lib/clipboard';

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));

function stubClipboard(impl: (text: string) => Promise<void>): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn(impl);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return { writeText };
}

afterEach(() => {
  vi.unstubAllGlobals();
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe('copyLabel', () => {
  it('reads as a sentence with or without a subject', () => {
    expect(copyLabel()).toBe('Copied');
    expect(copyLabel('SQL')).toBe('Copied SQL');
    expect(copyLabel('3 rows')).toBe('Copied 3 rows');
  });
});

describe('copyText', () => {
  it('writes the value and reports success', async () => {
    const { writeText } = stubClipboard(async () => undefined);
    await expect(copyText('SELECT 1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('SELECT 1');
  });

  it('stays quiet when the caller confirms in place', async () => {
    stubClipboard(async () => undefined);
    await copyText('x');
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('announces the copy when given a subject, for callers with nowhere to show it', async () => {
    stubClipboard(async () => undefined);
    await copyText('x', 'column name');
    expect(toasts.success).toHaveBeenCalledWith('Copied column name', expect.anything());
  });

  it('reports a rejection instead of throwing', async () => {
    // Clipboard access can be denied; the old fire-and-forget calls swallowed this.
    stubClipboard(async () => {
      throw new Error('Document is not focused');
    });
    await expect(copyText('x', 'SQL')).resolves.toBe(false);
    expect(toasts.error).toHaveBeenCalledWith('Could not copy to the clipboard', {
      id: expect.anything(),
      description: 'Document is not focused'
    });
    expect(toasts.success).not.toHaveBeenCalled();
  });
});

describe('resolveCopyValue', () => {
  it('passes a plain string through', async () => {
    await expect(resolveCopyValue('done')).resolves.toBe('done');
  });

  it('builds a lazy value only when asked', async () => {
    const build = vi.fn(() => 'big payload');
    const out = resolveCopyValue(build);
    expect(build).toHaveBeenCalledTimes(1);
    await expect(out).resolves.toBe('big payload');
  });

  it('awaits an async producer', async () => {
    await expect(resolveCopyValue(async () => 'fetched')).resolves.toBe('fetched');
  });
});
