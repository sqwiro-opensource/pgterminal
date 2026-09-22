import { describe, expect, it, vi } from 'vitest';

// keybindings.ts reads navigator.platform at module scope.
vi.stubGlobal('navigator', { platform: 'MacIntel' });
vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const { MENU_COMMANDS } = await import('../../../src/shared/menuCommands');
const { BINDINGS, runBindingById } = await import('../../../src/renderer/src/lib/keybindings');

describe('application menu commands', () => {
  it('every menu item names a binding that exists and can run', () => {
    for (const id of MENU_COMMANDS) {
      const binding = BINDINGS.find((b) => b.id === id);
      expect(binding, `menu command "${id}" has no binding`).toBeDefined();
      expect(binding?.run, `binding "${id}" is documentation-only`).toBeTypeOf('function');
    }
  });

  it('menu items keep the accelerator the keyboard already used', () => {
    // The menu matches accelerators before the renderer sees the key, so a drift here would take
    // the shortcut away rather than duplicate it.
    const accelerators: Record<string, string> = {
      'tab.new': '⌘N',
      'tab.close': '⌘W',
      'tab.reopen': '⌘⇧T',
      'tab.refresh': '⌘R',
      settings: '⌘,',
      palette: '⌘K',
      'palette.tables': '⌘P',
      'palette.document': '⌘⇧D',
      'view.sidebar': '⌘B',
      'view.inspector': '⌘I',
      history: '⌘⇧H',
      theme: '⌘⇧L',
      shortcuts: '⌘/'
    };
    for (const [id, keys] of Object.entries(accelerators)) {
      expect(BINDINGS.find((b) => b.id === id)?.keys.mac, id).toBe(keys);
    }
  });

  it('runBindingById refuses ids that name nothing runnable', () => {
    expect(runBindingById('nope')).toBe(false);
    expect(runBindingById('doc.link')).toBe(false);
  });
});
