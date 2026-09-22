import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

const pushed: { channel: string; payload: unknown }[] = [];
const checked: { manual?: boolean }[] = [];

vi.mock('electron', () => ({
  app: { name: 'PgTerminal', isPackaged: false, getVersion: () => '2.0.0', setAboutPanelOptions: vi.fn() },
  shell: { openExternal: vi.fn() },
  Menu: { buildFromTemplate: (t: MenuItemConstructorOptions[]) => t, setApplicationMenu: vi.fn() }
}));
vi.mock('@main/ipc/handle', () => ({ push: (channel: string, payload: unknown) => pushed.push({ channel, payload }) }));
vi.mock('../../src/main/ipc/handle', () => ({ push: (channel: string, payload: unknown) => pushed.push({ channel, payload }) }));
vi.mock('../../src/main/updates/autoUpdate', () => ({ checkForUpdates: (o?: { manual?: boolean }) => checked.push(o ?? {}) }));

const { buildMenu } = await import('../../src/main/menu');
const { MENU_COMMANDS } = await import('../../src/shared/menuCommands');

type Tpl = MenuItemConstructorOptions[];

function labels(menu: Tpl, top: string): string[] {
  const sub = menu.find((m) => m.label === top || m.role === top)?.submenu as Tpl | undefined;
  return (sub ?? []).map((i) => i.label ?? i.role ?? 'separator').filter((l) => typeof l === 'string');
}

describe('application menu', () => {
  it('offers Check for Updates and runs a manual check', () => {
    const menu = buildMenu() as unknown as Tpl;
    // On macOS it belongs in the app menu; elsewhere the test platform decides, so accept either.
    const all = menu.flatMap((m) => (m.submenu as Tpl | undefined) ?? []);
    const check = all.find((i) => i.label === 'Check for Updates…');
    expect(check).toBeDefined();
    checked.length = 0;
    check?.click?.(undefined as never, undefined as never, undefined as never);
    expect(checked).toEqual([{ manual: true }]);
  });

  it('every command item names a listed menu command, and sends it to the renderer', () => {
    const menu = buildMenu() as unknown as Tpl;
    const all = menu.flatMap((m) => (m.submenu as Tpl | undefined) ?? []);
    const commandItems = all.filter((i) => i.click && i.label !== 'Check for Updates…' && !i.label?.includes('Website') && !i.label?.includes('Source') && !i.label?.includes('Issue'));
    expect(commandItems.length).toBeGreaterThan(8);
    pushed.length = 0;
    for (const i of commandItems) i.click?.(undefined as never, undefined as never, undefined as never);
    const sent = pushed.map((p) => (p.payload as { command: string }).command);
    expect(pushed.every((p) => p.channel === 'app:menuCommand')).toBe(true);
    for (const c of sent) expect(MENU_COMMANDS).toContain(c);
  });

  it('keeps the help links on the product domain and the public repo', () => {
    const menu = buildMenu() as unknown as Tpl;
    expect(labels(menu, 'help')).toContain('PgTerminal Website');
    expect(labels(menu, 'help')).toContain('Report an Issue');
  });
});
