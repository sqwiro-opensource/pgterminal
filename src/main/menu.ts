/**
 * The application menu.
 *
 * Every item that acts on the workspace sends a keybinding id to the renderer, which owns the
 * action; the accelerators mirror `renderer/src/lib/keybindings.ts`. A menu accelerator is matched
 * before the renderer sees the key, so each one must dispatch the same binding the key would have
 * run — otherwise adding a menu would silently take the shortcut away.
 */
import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommandId } from '@shared/menuCommands';
import { push } from './ipc/handle';
import { checkForUpdates } from './updates/autoUpdate';

export const WEBSITE_URL = 'https://pgterminal.com';
export const REPO_URL = 'https://github.com/sqwiro-opensource/pgterminal';

function send(command: MenuCommandId): void {
  push('app:menuCommand', { command });
}

/** A menu item that runs a renderer binding. */
function item(label: string, command: MenuCommandId, accelerator?: string): MenuItemConstructorOptions {
  return { label, accelerator, click: () => send(command) };
}

const checkForUpdatesItem: MenuItemConstructorOptions = {
  label: 'Check for Updates…',
  click: () => void checkForUpdates({ manual: true })
};

export function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        checkForUpdatesItem,
        { type: 'separator' },
        item('Settings…', 'settings', 'CmdOrCtrl+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  template.push({
    label: 'File',
    submenu: [
      item('New Query', 'tab.new', 'CmdOrCtrl+N'),
      { type: 'separator' },
      item('Close Tab', 'tab.close', 'CmdOrCtrl+W'),
      item('Reopen Closed Tab', 'tab.reopen', 'CmdOrCtrl+Shift+T'),
      { type: 'separator' },
      item('Refresh', 'tab.refresh', 'CmdOrCtrl+R'),
      ...(isMac
        ? []
        : ([
            { type: 'separator' },
            item('Settings…', 'settings', 'CmdOrCtrl+,'),
            { role: 'quit' }
          ] as MenuItemConstructorOptions[]))
    ]
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  });

  template.push({
    label: 'View',
    submenu: [
      item('Command Palette', 'palette', 'CmdOrCtrl+K'),
      item('Open Table…', 'palette.tables', 'CmdOrCtrl+P'),
      item('Go to Document…', 'palette.document', 'CmdOrCtrl+Shift+D'),
      { type: 'separator' },
      item('Toggle Sidebar', 'view.sidebar', 'CmdOrCtrl+B'),
      item('Toggle Inspector', 'view.inspector', 'CmdOrCtrl+I'),
      item('Query History', 'history', 'CmdOrCtrl+Shift+H'),
      item('Toggle Theme', 'theme', 'CmdOrCtrl+Shift+L'),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
    ]
  });

  template.push({ label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' as const }] : [{ role: 'close' as const }])] });

  template.push({
    role: 'help',
    submenu: [
      item('Keyboard Shortcuts', 'shortcuts', 'CmdOrCtrl+/'),
      { type: 'separator' },
      { label: 'PgTerminal Website', click: () => void shell.openExternal(WEBSITE_URL) },
      { label: 'Source Code', click: () => void shell.openExternal(REPO_URL) },
      { label: 'Report an Issue', click: () => void shell.openExternal(`${REPO_URL}/issues/new`) },
      ...(isMac ? [] : ([{ type: 'separator' }, checkForUpdatesItem] as MenuItemConstructorOptions[]))
    ]
  });

  return Menu.buildFromTemplate(template);
}

/** Installs the application menu and the native About panel. Call once, after `ready`. */
export function installMenu(): void {
  app.setAboutPanelOptions({
    applicationName: 'PgTerminal',
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron ?? '?'}`,
    copyright: `© ${new Date().getFullYear()} Cloud Hub Limited`,
    website: WEBSITE_URL
  });
  Menu.setApplicationMenu(buildMenu());
}
