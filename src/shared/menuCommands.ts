/**
 * Keybinding ids the application menu dispatches to the renderer.
 *
 * The renderer owns these actions (see `lib/keybindings.ts`); the menu only names them. Listing
 * them here lets a renderer test prove every menu item still points at a binding that exists and
 * can run, which a menu built in the main process could not check for itself.
 */
export const MENU_COMMANDS = [
  'tab.new',
  'tab.close',
  'tab.reopen',
  'tab.refresh',
  'settings',
  'palette',
  'palette.tables',
  'palette.document',
  'view.sidebar',
  'view.inspector',
  'history',
  'shortcuts',
  'theme'
] as const;

export type MenuCommandId = (typeof MENU_COMMANDS)[number];
