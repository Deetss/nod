import { spawn } from 'node:child_process';
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
  session,
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
import { PairingCodes } from '../server/pairing';
import { appEnv } from '../server/env';
import { migrateLegacyDirs } from '../server/migrate';
import { consoleSink } from '../server/request-log';
import { loadSettings } from '../server/settings';
import { appImageRelaunch, relaunchRestarter } from '../server/restart';
import { loadOrCreateSessionToken } from '../server/session-token';
import { attachOrStart, startupLines } from '../server/service';
import { cliArgs, cliCommand, runCli, type CliCommand } from '../server/cli';
import { pairTarget, parseHubUrl, SEEN_SENT_PARAM, type CheckResult, type HubView, type PairResult } from '../shared/hub';
import { defaultSeenPath } from '../server/seen';
import { changedMarks, parseSeenMap, type SeenMap } from '../server/seen-merge';
import { HubWatch, type WatchMode } from './hub-watch';
import { pushSeen } from './seen-push';
import {
  chooseStart,
  frameNavigationAllowed,
  ipcAllowed,
  isOrigin,
  permissionAllowed,
  probeHub,
  rateGate,
  readHubSetting,
} from './hub';

import { openPairWindow } from './pair-window';
import { startUpdater, type Updater } from './updater';
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
/** `nod update`, `nod pair`, `nod settings`: ask the running server, print the answer and exit. */
const CLI = cliCommand(process.argv);
/** `nod --local`: ignore the Hub URL for this run, so Settings > Hub can change or clear it. */
const LOCAL = process.argv.includes('--local');
const DEFAULT_SIZE = { width: 1500, height: 900 };
const DIST_DIR = join(__dirname, '..', 'web');

// Before setName, so Chromium opens the copied profile rather than an empty one.
migrateLegacyDirs();
app.setName(APP_ID);
app.setDesktopName(`${APP_ID}.desktop`);
if (SERVICE) {
  // No display needed, and a profile of its own so it never fights the desktop app over files.
  app.commandLine.appendSwitch('ozone-platform', 'headless');
  app.setPath('userData', `${app.getPath('userData')}-service`);
} else if (CLI) {
  app.commandLine.appendSwitch('ozone-platform', 'headless');
  app.setPath('userData', `${app.getPath('userData')}-update`);
} else {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

let win: BrowserWindow | undefined;
let origin = '';
/** This machine's server, the only origin that may change the hub. Empty while started on the hub. */
let localOrigin = '';
/** True when the window talks to a service that was already running, or to the hub. */
let attached = false;
/** The saved Hub URL, or '' for none. */
let hubUrl = '';
/** True when the window shows the hub. */
let onHub = false;
/** True when the hub stopped answering and the window fell back to this machine's server. */
let hubDown = false;
/** Watches the hub while this desktop uses one. */
let watch: HubWatch | undefined;
/** The local seen marks when local mode began. Those made since go to the hub on return. */
let seenBefore: SeenMap = {};
let quitting = false;
/** Set in the process that owns the server; an attached window leaves updates to the service. */
let updater: Updater | undefined;

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
/** A page from the hub gets at most one notification call a second; the rest are dropped. */
const hubNotifyGate = rateGate(1000);

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

/** Starts this command line again once this instance exits. */
function relaunch(): void {
  const appImage = process.env.APPIMAGE;
  if (!appImage) {
    app.relaunch();
    return;
  }
  const { command, args } = appImageRelaunch(appImage, process.argv, process.pid);
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

function quit(): void {
  quitting = true;
  app.quit();
}

async function startServer(): Promise<string> {
  const orgSettings = await loadSettings(userFile('app-settings.json'), consoleSink);
  const provider = await buildProvider(FIXTURES, orgSettings);
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
    mode: SERVICE ? 'service' : 'own',
    token: FIXTURES ? newSessionToken() : await loadOrCreateSessionToken(),
    distDir: DIST_DIR,
    phone,
    devices,
    pairing: FIXTURES ? new PairingCodes() : await PairingCodes.open(),
    settings: orgSettings,
    settingsPath: userFile('app-settings.json'),
    restart: relaunchRestarter(relaunch, quit),
    updates: { check: () => updater?.check() ?? Promise.resolve({ state: 'unsupported' }) },
    assetLinks,
    vapidPublicKey: vapid?.publicKey,
    pushSender,
    buildId: await readBuildId(DIST_DIR),
    version: app.getVersion(),
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

/** The window stays on its origin (this machine's server or the hub); only github.com links leave, to the browser. */
function guardNavigation(w: BrowserWindow): void {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (isGithubUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const lock = (event: Electron.Event, url: string) => {
    if (isOrigin(url, origin)) return;
    event.preventDefault();
    if (isGithubUrl(url)) void shell.openExternal(url);
  };
  w.webContents.on('will-navigate', lock);
  w.webContents.on('will-redirect', lock);
  w.webContents.on('will-attach-webview', (event) => event.preventDefault());
  w.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame && !frameNavigationAllowed(details.url, origin)) details.preventDefault();
  });
  const ses = w.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(permissionAllowed(permission, details.requestingUrl, origin)),
  );
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => permissionAllowed(permission, requestingOrigin, origin));
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

/** The sender is the window's top frame on an origin `channel` accepts. Hub pages never reach the hub channels. */
function fromApp(event: IpcMainInvokeEvent, channel: string): boolean {
  const top = win !== undefined && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  return top && ipcAllowed(channel, event.senderFrame?.url, { current: origin, local: localOrigin });
}

/** A main-process question the page cannot answer for the user. */
async function confirm(message: string, detail: string, yes: string): Promise<boolean> {
  const opts = { type: 'question' as const, buttons: [yes, 'Cancel'], defaultId: 1, cancelId: 1, message, detail };
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  return response === 0;
}

/** Fetches with the window's session, so the hub sees this desktop's device cookie. */
const sessionFetch = (url: string, init: RequestInit) => session.defaultSession.fetch(url, init);

function show(url: string): void {
  win?.loadURL(url).catch((e: unknown) => console.error(`[hub] could not load ${url}: ${e instanceof Error ? e.message : String(e)}`));
}

const readSeen = async (): Promise<SeenMap> => parseSeenMap(await readJson(defaultSeenPath()));

/** This machine's server. A window that started on the hub starts one on first use. */
async function ensureLocal(): Promise<string> {
  if (!localOrigin) ({ origin: localOrigin } = await attachOrStart(startServer));
  return localOrigin;
}

async function enterLocalMode(): Promise<void> {
  seenBefore = await readSeen();
  origin = await ensureLocal();
  onHub = false;
  hubDown = true;
  console.error(`[hub] ${hubUrl} stopped answering; local mode.`);
  show(origin);
}

/** Sends the marks made in local mode, then shows the hub with the count for its toast. */
async function returnToHub(): Promise<void> {
  const sent = await pushSeen(hubUrl, changedMarks(seenBefore, await readSeen()), sessionFetch);
  origin = hubUrl;
  onHub = true;
  hubDown = false;
  console.error(`[hub] ${hubUrl} answers again; ${sent} seen marks sent.`);
  show(`${hubUrl}/?${SEEN_SENT_PARAM}=${sent}`);
}

function watchHub(mode: WatchMode): void {
  watch?.stop();
  const probe = async () => (await probeHub(hubUrl, sessionFetch)).state === 'paired';
  watch = new HubWatch(mode, probe, { toLocal: enterLocalMode, toHub: returnToHub, log: (line) => console.error(line) });
  watch.start();
}

/** Moves the window onto the hub, as a paired desktop. */
function attachToHub(): void {
  origin = hubUrl;
  attached = true;
  onHub = true;
  hubDown = false;
  watchHub('hub');
  show(hubUrl);
}

const hubView = (): HubView => ({ url: hubUrl, attached: onHub, down: hubDown });

function registerHubIpc(): void {
  ipcMain.handle('hub:get', (event): HubView => {
    if (!fromApp(event, 'hub:get')) throw new Error('Untrusted sender');
    return hubView();
  });

  ipcMain.handle('hub:retry', async (event): Promise<HubView> => {
    if (!fromApp(event, 'hub:retry')) throw new Error('Untrusted sender');
    await watch?.retry();
    return hubView();
  });

  ipcMain.handle('hub:check', async (event, raw: unknown): Promise<CheckResult> => {
    if (!fromApp(event, 'hub:check')) throw new Error('Untrusted sender');
    const parsed = parseHubUrl(typeof raw === 'string' ? raw : '');
    if (!parsed.ok) return parsed;
    if (parsed.url && parsed.url !== hubUrl) {
      const detail = 'Nod will open this hub in its window at the next start, once this desktop is paired with it.';
      if (!(await confirm(`Use ${parsed.url} as this desktop's hub?`, detail, 'Use this hub'))) {
        return { ok: false, error: 'Not saved.' };
      }
    }
    if (parsed.url !== hubUrl) {
      // A new or cleared Hub URL ends the watch on the old one, and local mode with it.
      watch?.stop();
      watch = undefined;
      hubDown = false;
    }
    hubUrl = parsed.url;
    await writeJson(userFile('hub.json'), { hubUrl });
    return { ok: true, url: hubUrl, status: hubUrl ? await probeHub(hubUrl, sessionFetch) : undefined };
  });

  ipcMain.handle('hub:pair', async (event, input: unknown): Promise<PairResult> => {
    if (!fromApp(event, 'hub:pair') || !win) throw new Error('Untrusted sender');
    const target = pairTarget(hubUrl, typeof input === 'string' ? input : '');
    if (!target.ok) return target;
    if (!(await openPairWindow(win, target.url, hubUrl))) return { ok: false, error: 'Not paired. The pair window closed first.' };
    // The page moving to `/` is only a hint; the hub itself must name this desktop's role.
    const status = await probeHub(hubUrl, sessionFetch);
    if (status.state !== 'paired') return { ok: false, error: 'The hub did not accept this desktop. Try a new code.' };
    if (await confirm(`Open ${hubUrl} in this window?`, `Paired as ${status.role}.`, 'Open the hub')) setImmediate(attachToHub);
    return { ok: true };
  });
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
    if (!fromApp(event, 'notify')) throw new Error('Untrusted sender');
    const items = parseNotifyItems(payload);
    if (!items) throw new Error('Bad notification payload');
    if (onHub && !hubNotifyGate()) return;
    if (win?.isFocused()) return;
    const { show, skipped } = gateDesktop(items, settings);
    for (const kind of skipped) consoleNotifyLog.info(`[notify] skipped ${kind} for Desktop (off)`);
    showDesktop(show);
  });

  ipcMain.handle('notify:test', (event): NotifyTargetResult => {
    if (!fromApp(event, 'notify:test')) throw new Error('Untrusted sender');
    if (onHub && !hubNotifyGate()) return { target: 'Desktop', ok: false, detail: 'too many notifications' };

    const shown = showDesktop([TEST_NOTIFICATION]) > 0;
    return shown ? { target: 'Desktop', ok: true } : { target: 'Desktop', ok: false, detail: 'notifications unsupported' };
  });

  ipcMain.handle('settings:get', (event) => {
    if (!fromApp(event, 'settings:get')) throw new Error('Untrusted sender');
    return settings;
  });

  ipcMain.handle('shell:build', (event) => {
    if (!fromApp(event, 'shell:build')) throw new Error('Untrusted sender');

    // A hub page carries the hub's build, which this shell cannot match or relaunch onto.
    return origin === localOrigin ? readBuildId(DIST_DIR) : null;
  });

  ipcMain.handle('shell:relaunch', (event) => {
    if (!fromApp(event, 'shell:relaunch')) throw new Error('Untrusted sender');
    relaunch();
    quit();
  });

  ipcMain.handle('settings:set', async (event, payload: unknown) => {
    if (!fromApp(event, 'settings:set')) throw new Error('Untrusted sender');
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
  updater = startUpdater({ service: true });
}

async function runCommand(command: CliCommand): Promise<void> {
  const { out, code } = await runCli(command, cliArgs(process.argv), await loadOrCreateSessionToken());
  if (code === 0) console.log(out);
  else console.error(out);
  app.exit(code);
}

async function main(): Promise<void> {
  if (CLI) return runCommand(CLI);
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
  hubUrl = readHubSetting(await readJson(userFile('hub.json')));
  registerIpc();
  registerHubIpc();
  const start = SMOKE || LOCAL ? { mode: 'local' as const } : await chooseStart(hubUrl, (o) => probeHub(o, sessionFetch));
  if (start.mode === 'hub') {
    ({ origin } = start);
    attached = true;
    onHub = true;
  } else {
    if (start.log) console.error(start.log);
    hubDown = start.down === true;
    if (hubDown) seenBefore = await readSeen();
    ({ origin, attached } = await attachOrStart(startServer));
    localOrigin = origin;
  }
  if (start.mode === 'hub' || hubDown) watchHub(start.mode === 'hub' ? 'hub' : 'local');
  // On the hub nothing on this machine owns an updater, so the window updates its own AppImage on quit.
  if ((!attached || onHub) && !SMOKE) updater = startUpdater({ service: false });

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
