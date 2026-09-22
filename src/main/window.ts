import { BrowserWindow, nativeTheme, session, shell } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join } from 'path';
import { setMainWindow } from './ipc/handle';

const DEV_URL = process.env.ELECTRON_RENDERER_URL;
const isDevServer = is.dev && Boolean(DEV_URL);

/**
 * Content-Security-Policy.
 * Production is strict (`script-src 'self'`). In development Vite's React plugin injects an
 * inline refresh preamble and the HMR client talks over ws://localhost, so dev relaxes only
 * `script-src` to allow 'unsafe-inline' and `connect-src` for the dev server.
 */
function buildCsp(): string {
  const scriptSrc = isDevServer ? "'self' 'unsafe-inline'" : "'self'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' ws://localhost:* http://localhost:*",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'"
  ].join('; ');
}

let cspInstalled = false;
function installCsp(): void {
  if (cspInstalled) return;
  cspInstalled = true;
  const csp = buildCsp();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    // Drop any pre-existing CSP header (case-insensitive) so ours is the only one.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key];
    }
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

function isOwnOrigin(url: string): boolean {
  if (url.startsWith('file:')) return true;
  if (isDevServer && DEV_URL) {
    try {
      return new URL(url).origin === new URL(DEV_URL).origin;
    } catch {
      return false;
    }
  }
  return false;
}

export function createMainWindow(): BrowserWindow {
  installCsp();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1116' : '#ffffff',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 12 } }
      : { autoHideMenuBar: true }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });
  setMainWindow(win);

  win.on('ready-to-show', () => {
    win.show();
    if (is.dev && process.env.PGT_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('closed', () => setMainWindow(null));

  win.webContents.on('will-navigate', (event, url) => {
    if (!isOwnOrigin(url)) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.PGT_SMOKE === '1') {
    win.webContents.on('console-message', (_event, level, message) => {
      const levels = ['verbose', 'info', 'warning', 'error'] as const;
      process.stdout.write(`[renderer:${levels[level] ?? level}] ${message}\n`);
    });
    win.webContents.on('did-finish-load', () => process.stdout.write('[smoke] did-finish-load\n'));
    win.webContents.on('did-fail-load', (_e, code, desc, url) =>
      process.stdout.write(`[smoke] did-fail-load ${code} ${desc} ${url}\n`)
    );
  }

  if (isDevServer && DEV_URL) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
