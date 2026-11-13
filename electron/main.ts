import { join } from 'node:path';
import { serve } from '@hono/node-server';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  screen,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type Rectangle,
} from 'electron';
import { createApp } from '../server/app';
import { buildProvider } from '../server/build-provider';
import { APP_ID } from '../server/app-paths';
import { loadAssetLinks } from '../server/assetlinks';
import { readBuildId } from '../server/build-info';
import { startBackground } from '../server/background';
import { consoleNotifyLog, webPushSender } from '../server/push';
import { loadOrCreateVapid } from '../server/vapid';
import { DeviceStore } from '../server/devices';
import { appEnv } from '../server/env';
import { migrateLegacyDirs } from '../server/migrate';
import { consoleSink } from '../server/request-log';
import { loadSettings } from '../server/settings';
import { relaunchRestarter } from '../server/restart';
import { loadOrCreateSessionToken } from '../server/session-token';
import { attachOrStart, startupLines } from '../server/service';
import { startUpdater } from './updater';
import {
  detectTailnet,
  newSessionToken,
  phoneOrigin,
  PHONE_PORT,
  phoneRequested,
  type PhoneAccess,
} from '../server/security';
import { parseNotifyItems, parseSettings } from '../shared/notify-payload';
import { TEST_NOTIFICATION, type NotifyTargetResult } from '../shared/notify-test';
import {
  DEFAULT_SETTINGS,
  gateDesktop,
  notifyLabel,
  type NotifyItem,
  type NotifySettings,
  type NotifyTarget,
} from '../shared/notify-rules';
import { readJson, writeJson } from './json-file';
import { createSignalHandler } from './shutdown';

/** The window and document title. APP_ID names the folders, the desktop file and the window class. */
const TITLE = 'Nod';
const SMOKE = process.argv.includes('--smoke');
const FIXTURES = process.argv.includes('--fixtures') || appEnv('FIXTURES') === '1';
/** `nod serve`: the server only, no window, phone access on. */
const SERVICE = process.argv.includes('--serve');
const DEFAULT_SIZE = { width: 1500, height: 900 };

// Before setName, so Chromium opens the copied profile rather than an empty one.
migrateLegacyDirs();
app.setName(APP_ID);
app.setDesktopName(`${APP_ID}.desktop`);
if (SERVICE) {
  // No display needed, and a profile of its own so it never fights the desktop app over files.
  app.commandLine.appendSwitch('ozone-platform', 'headless');
  app.setPath('userData', `${app.getPath('userData')}-service`);
} else {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

let win: BrowserWindow | undefined;
let origin = '';
/** True when the window talks to a service that was already running. */
let attached = false;
let quitting = false;

// Shutdown through Electron's quit path; a bare SIGTERM kills Chromium mid-teardown.
const onSignal = createSignalHandler(app, () => {
  quitting = true;
});
process.on('SIGTERM', onSignal);
process.on('SIGINT', onSignal);
let settings: NotifySettings = DEFAULT_SETTINGS;
let phoneAccess = false;
let phone: PhoneAccess | undefined;
const live = new Set<Notification>();

const userFile = (name: string) => join(app.getPath('userData'), name);

/** Only https://github.com/... leaves the app, and only to the default browser. */
function isGithubUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function startServer(): Promise<string> {
  const orgSettings = await loadSettings(userFile('app-settings.json'), consoleSink);
  const provider = await buildProvider(FIXTURES, orgSettings);
  const distDir = join(__dirname, '..', 'web');
  // Tailscale Serve proxies to a fixed port, so phone access cannot use a random one.
  const port = SERVICE || phoneRequested(phoneAccess) ? PHONE_PORT : 0;
  phone = port === 0 ? undefined : await detectTailnet();
  const assetLinks = phone ? await loadAssetLinks(orgSettings.android.packageId) : undefined;
  const devices = await DeviceStore.open();
  const vapid = phone ? await loadOrCreateVapid() : undefined;
  const pushSender = vapid ? webPushSender(vapid, orgSettings.push.contact) : undefined;
  // Reached only when no service is running, so this server owns the poll.
  const { sync } = startBackground({ provider, devices, pushSender, fixtures: FIXTURES });
  const handler = createApp({
    provider,
    sync,
    port,
    token: FIXTURES ? newSessionToken() : await loadOrCreateSessionToken(),
    distDir,
    phone,
    devices,
    settings: orgSettings,
    settingsPath: userFile('app-settings.json'),
    restart: relaunchRestarter(
      () => app.relaunch(),
      () => {
        quitting = true;
        app.quit();
      },
    ),
    assetLinks,
    vapidPublicKey: vapid?.publicKey,
    pushSender,
    buildId: await readBuildId(distDir),
  });
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: handler.fetch, port, hostname: '127.0.0.1' }, (info) => {
      const bound = `http://127.0.0.1:${info.port}`;
      if (SERVICE) for (const line of startupLines({ bound, phone, deviceCount: devices.list().length })) console.log(line);
      resolve(bound);
    });
    server.on('error', reject);
  });
}

function readPhoneSetting(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as { phoneAccess?: unknown }).phoneAccess === true;
}

/** Writes phoneAccess and keeps the other keys, such as projectNumber. */
async function savePhoneSetting(value: boolean): Promise<void> {
  const raw = await readJson(userFile('app-settings.json'));
  const rest = typeof raw === 'object' && raw !== null ? raw : {};
  await writeJson(userFile('app-settings.json'), { ...rest, phoneAccess: value });
}

function buildMenu(): void {
  if (attached) {
    // The service owns phone access, so there is nothing to offer, and no menu means Alt stays free for key caps.
    Menu.setApplicationMenu(null);
    return;
  }
  const url = phone ? phoneOrigin(phone.host) : undefined;
  const phoneItems: MenuItemConstructorOptions[] = url
    ? [
        { label: `Phone URL: ${url}`, enabled: false },
        { label: 'Copy phone URL', click: () => clipboard.writeText(url) },
      ]
    : [];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Settings',
        submenu: [
          {
            label: 'Phone access',
            type: 'checkbox',
            checked: phoneAccess,
            click: (item) => {
              phoneAccess = item.checked;
              void savePhoneSetting(phoneAccess);
              void dialog.showMessageBox({
                type: 'info',
                message: `Phone access ${phoneAccess ? 'on' : 'off'}`,
                detail: 'Restart Nod for this to take effect.',
              });
            },
          },
          ...phoneItems,
        ],
      },
    ]),
  );
}

function isVisibleOnScreen(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    return (
      bounds.x < a.x + a.width &&
      bounds.x + bounds.width > a.x &&
      bounds.y < a.y + a.height &&
      bounds.y + bounds.height > a.y
    );
  });
}

async function loadBounds(): Promise<Partial<Rectangle>> {
  const raw = await readJson(userFile('window-state.json'));
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SIZE;
  const { x, y, width, height } = raw as Record<string, unknown>;
  const nums = [x, y, width, height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return DEFAULT_SIZE;
  const bounds = { x, y, width, height } as Rectangle;
  if (bounds.width < 400 || bounds.height < 300) return DEFAULT_SIZE;
  return isVisibleOnScreen(bounds) ? bounds : { width: bounds.width, height: bounds.height };
}

function trackBounds(w: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    if (w.isDestroyed() || w.isMinimized() || w.isMaximized() || w.isFullScreen()) return;
    void writeJson(userFile('window-state.json'), w.getBounds());
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  w.on('resize', later);
  w.on('move', later);
  w.on('close', save);
}

function guardNavigation(w: BrowserWindow): void {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (isGithubUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    if (isGithubUrl(url)) void shell.openExternal(url);
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const w = new BrowserWindow({
    ...(await loadBounds()),
    minWidth: 400,
    minHeight: 300,
    show: !SMOKE,
    autoHideMenuBar: true,
    title: TITLE,
    icon: join(__dirname, '..', '..', 'electron', 'assets', 'icon-512.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A hidden window must keep polling so notifications still arrive.
      backgroundThrottling: false,
    },
  });
  guardNavigation(w);

  w.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      app.quit();
    }
  });

  if (!SMOKE) {
    trackBounds(w);
    w.on('close', (event) => {
      if (quitting) return;
      event.preventDefault();
      w.hide();
    });
  }

  await w.loadURL(origin);
  return w;
}

function fromApp(event: IpcMainInvokeEvent): boolean {
  return win !== undefined && event.sender === win.webContents && event.senderFrame?.url.startsWith(origin) === true;
}

function openFromNotification(target: NotifyTarget | undefined): void {
  showWindow();
  if (target) win?.webContents.send('open', target);
}

/** Shows each item as a desktop notification, with one log line per item. Returns how many showed. */
function showDesktop(items: readonly NotifyItem[]): number {
  if (!Notification.isSupported()) {
    for (const item of items) consoleNotifyLog.warn(`[notify] ${notifyLabel(item)} -> desktop failed: notifications unsupported`);
    return 0;
  }
  for (const item of items) {
    const note = new Notification({ title: item.title, body: item.body });
    live.add(note);
    note.on('click', () => openFromNotification(item.target));
    note.on('close', () => live.delete(note));
    note.on('failed', (_event, error) => {
      live.delete(note);
      consoleNotifyLog.warn(`[notify] ${notifyLabel(item)} -> desktop failed: ${error}`);
    });
    note.show();
    consoleNotifyLog.info(`[notify] ${notifyLabel(item)} -> desktop`);
  }
  return items.length;
}

function registerIpc(): void {
  ipcMain.handle('notify', (event, payload: unknown) => {
    if (!fromApp(event)) throw new Error('Untrusted sender');
    const items = parseNotifyItems(payload);
    if (!items) throw new Error('Bad notification payload');
    if (win?.isFocused()) return;
    const { show, skipped } = gateDesktop(items, settings);
    for (const kind of skipped) consoleNotifyLog.info(`[notify] skipped ${kind} for Desktop (off)`);
    showDesktop(show);
  });

  ipcMain.handle('notify:test', (event): NotifyTargetResult => {
    if (!fromApp(event)) throw new Error('Untrusted sender');
    const shown = showDesktop([TEST_NOTIFICATION]) > 0;
    return shown ? { target: 'Desktop', ok: true } : { target: 'Desktop', ok: false, detail: 'notifications unsupported' };
  });

  ipcMain.handle('settings:get', (event) => {
    if (!fromApp(event)) throw new Error('Untrusted sender');
    return settings;
  });

  ipcMain.handle('settings:set', async (event, payload: unknown) => {
    if (!fromApp(event)) throw new Error('Untrusted sender');
    const next = parseSettings(payload);
    if (!next) throw new Error('Bad settings payload');
    settings = next;
    await writeJson(userFile('notify-settings.json'), settings);
    return settings;
  });
}

async function smoke(): Promise<void> {
  const title = await win?.webContents.executeJavaScript('document.title');
  if (title !== TITLE) throw new Error(`Unexpected document title: ${String(title)}`);
  console.log('SMOKE OK');
}

/** The service has no window, so it takes no instance lock and keeps no settings menu. */
async function runService(): Promise<void> {
  app.on('window-all-closed', () => undefined);
  await app.whenReady();
  app.dock?.hide();
  await startServer();
  startUpdater({ service: true });
}

async function main(): Promise<void> {
  if (SERVICE) return runService();
  if (!SMOKE && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
  });
  // The window hides on close, so nothing quits until Ctrl+Q.
  app.on('window-all-closed', () => undefined);

  await app.whenReady();
  settings = parseSettings(await readJson(userFile('notify-settings.json'))) ?? DEFAULT_SETTINGS;
  phoneAccess = readPhoneSetting(await readJson(userFile('app-settings.json')));
  registerIpc();
  ({ origin, attached } = await attachOrStart(startServer));
  if (!attached && !SMOKE) startUpdater({ service: false });
  buildMenu();
  win = await createWindow();

  if (SMOKE) {
    await smoke();
    app.exit(0);
  }
}

main().catch((e: unknown) => {
  console.error(`Nod could not start: ${e instanceof Error ? e.message : String(e)}`);
  app.exit(1);
});
