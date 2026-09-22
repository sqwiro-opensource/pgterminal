import { app, BrowserWindow } from 'electron';
import { electronApp } from '@electron-toolkit/utils';
import { readFile, writeFile } from 'fs/promises';
import { registerIpc } from './ipc/register';
import { getMainWindow } from './ipc/handle';
import { createMainWindow } from './window';
import { shutdown } from './lifecycle';
import { initStores } from './store/stores';
import { installShutdownHook } from './db/ConnectionRegistry';
import { installAutoUpdate } from './updates/autoUpdate';

if (!app.requestSingleInstanceLock()) {
  process.stderr.write('[main] another pgui instance holds the single-instance lock; quitting\n');
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  process.on('uncaughtException', (err) => {
    process.stderr.write(`[main] uncaughtException: ${err.stack ?? err.message}\n`);
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    process.stderr.write(`[main] unhandledRejection: ${msg}\n`);
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.cloudhub.pgui');
    initStores({ cwd: app.getPath('userData'), projectVersion: app.getVersion() });
    installShutdownHook();
    registerIpc();
    const win = createMainWindow();
    installSmokeHooks(win);
    installAutoUpdate();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void shutdown().finally(() => app.quit());
  });
}

/**
 * Automated verification hooks (never active in normal use):
 * - PGUI_SCREENSHOT=<path>: capture the window 1.5 s after load, write a PNG, then quit.
 * - PGUI_SMOKE=1 (without a screenshot path): quit 2 s after load with exit code 0.
 */
function installSmokeHooks(win: BrowserWindow): void {
  const screenshotPath = process.env.PGUI_SCREENSHOT;
  const smoke = process.env.PGUI_SMOKE === '1';
  if (!screenshotPath && !smoke) return;

  win.webContents.once('did-finish-load', () => {
    if (screenshotPath) {
      setTimeout(async () => {
        try {
          if (!win.isVisible()) win.show();
          const dom = await win.webContents.executeJavaScript(
            `JSON.stringify({ ready: document.readyState, rootChildren: document.getElementById('root')?.childElementCount ?? -1, bodyText: document.body.innerText.slice(0, 120), pgui: typeof window.pgui, require: typeof require })`
          );
          process.stdout.write(`[smoke] dom ${dom}\n`);
          const scriptPath = process.env.PGUI_SMOKE_SCRIPT;
          if (scriptPath) {
            const src = await readFile(scriptPath, 'utf8');
            // The script must evaluate to a value or a promise; the result is printed as JSON.
            const result = await Promise.race([
              win.webContents.executeJavaScript(`(async () => { ${src} })()`),
              new Promise((_, reject) => setTimeout(() => reject(new Error('smoke script timed out')), 90_000))
            ]);
            process.stdout.write(`[smoke] result ${JSON.stringify(result)}\n`);
            await new Promise((r) => setTimeout(r, 800));
          }
          const image = await win.webContents.capturePage();
          await writeFile(screenshotPath, image.toPNG());
          process.stdout.write('[smoke] screenshot written\n');
        } catch (err) {
          process.stderr.write(`[smoke] screenshot failed: ${String(err)}\n`);
          process.exitCode = 1;
        }
        app.quit();
      }, 1500);
    } else {
      setTimeout(() => app.quit(), 2000);
    }
  });
}
