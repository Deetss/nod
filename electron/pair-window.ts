import { BrowserWindow, type Event } from 'electron';
import { isOrigin } from './hub';

/**
 * Opens the hub's pair page in a child window on the main window's session, so the device
 * cookie the hub sets lands where the main window reads it. The page trades the code and
 * then moves to `/`; that move means paired. Closing the window first means not paired.
 * No preload, and navigation never leaves the hub.
 */
export function openPairWindow(parent: BrowserWindow, pairUrl: string, hubOrigin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      parent,
      modal: true,
      width: 480,
      height: 560,
      title: 'Pair this desktop',
      autoHideMenuBar: true,
      webPreferences: { session: parent.webContents.session, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let settled = false;
    const finish = (paired: boolean) => {
      if (settled) return;
      settled = true;
      resolve(paired);
      if (!w.isDestroyed()) w.close();
    };
    const lock = (event: Event, url: string) => {
      if (!isOrigin(url, hubOrigin)) event.preventDefault();
    };
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', lock);
    w.webContents.on('will-redirect', lock);
    w.webContents.on('did-navigate', (_event, url) => {
      if (isOrigin(url, hubOrigin) && new URL(url).pathname === '/') finish(true);
    });
    w.on('closed', () => finish(false));
    void w.loadURL(pairUrl);
  });
}
