import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { buildProvider } from './build-provider';
import { FIXTURE_BOT } from './bot-fixtures';
import { loadAssetLinks } from './assetlinks';
import { ActivityStore } from './activity-store';
import { DeviceStore } from './devices';
import { appEnv } from './env';
import { migrateLegacyDirs } from './migrate';
import { startBackground } from './background';
import { webPushSender } from './push';
import { loadOrCreateVapid } from './vapid';
import { readBuildId } from './build-info';
import { Orca } from './orca';
import { OrcaPrefsStore } from './orca-prefs';
import { consoleSink } from './request-log';
import { defaultSettingsPath, loadSettings } from './settings';
import { exitRestarter } from './restart';
import { detectTailnet, newSessionToken, phoneOrigin } from './security';
import { loadOrCreateSessionToken } from './session-token';
import { startupLines } from './service';

const DEFAULT_PORT = 4477;
/** `pnpm serve`: the headless service, with phone access on. */
const SERVICE = process.argv.includes('--serve');

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`PORT must be a number from 1 to 65535, got "${raw}".`);
    process.exit(1);
  }
  return n;
}

async function main(): Promise<void> {
  migrateLegacyDirs();
  const fixtures = process.argv.includes('--fixtures') || appEnv('FIXTURES') === '1';
  const port = parsePort(process.env.PORT);
  const settings = fixtures ? { ...(await loadSettings(undefined, consoleSink)), bot: FIXTURE_BOT } : await loadSettings(undefined, consoleSink);
  const provider = await buildProvider(fixtures, settings).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'Could not start.');
    return process.exit(1);
  });
  const distDir = fileURLToPath(new URL('../dist/web', import.meta.url));
  const phone = SERVICE || appEnv('PHONE') === '1' ? await detectTailnet() : undefined;
  const orca = new Orca({ fixtures, settings });
  void orca.status();
  const devices = await DeviceStore.open();
  const activity = fixtures ? ActivityStore.memory() : await ActivityStore.open();
  const orcaPrefs = fixtures ? OrcaPrefsStore.memory() : await OrcaPrefsStore.open();
  const vapid = phone ? await loadOrCreateVapid() : undefined;
  const assetLinks = phone ? await loadAssetLinks(settings.android.packageId) : undefined;
  const pushSender = vapid ? webPushSender(vapid, settings.push.contact) : undefined;
  const { sync } = startBackground({ provider, devices, pushSender, fixtures });
  const app = createApp({
    provider,
    sync,
    port,
    token: fixtures ? newSessionToken() : await loadOrCreateSessionToken(),
    distDir,
    phone,
    orca,
    settings,
    settingsPath: defaultSettingsPath(),
    restart: exitRestarter(),
    devices,
    activity,
    orcaPrefs,
    vapidPublicKey: vapid?.publicKey,
    pushSender,
    assetLinks,
    buildId: await readBuildId(distDir),
  });

  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
    const mode = fixtures ? ' (fixture data, no GitHub calls)' : '';
    const bound = `http://127.0.0.1:${port}`;
    if (SERVICE) {
      for (const line of startupLines({ bound, phone, deviceCount: devices.list().length })) console.log(line);
      return;
    }
    console.log(`Nod running at ${bound}${mode}`);
    if (phone) console.log(`Phone access on: ${phoneOrigin(phone.host)}`);
  });
  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other process or set PORT.`);
    } else {
      console.error(`Server error: ${e.message}`);
    }
    process.exit(1);
  });
}

void main();
