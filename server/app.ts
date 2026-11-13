import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { bodyLimit } from 'hono/body-limit';
import { DEFAULT_CLOSED_WINDOW, isClosedWindow } from '../shared/closed';
import { isUploadType, uploadName, UPLOAD_MAX_BYTES } from '../shared/image-upload';
import { parseImageUrl, sniffImageType } from '../shared/image-url';
import { DEFAULT_SETTINGS, statusNames, type Settings } from '../shared/settings';
import type { SettingsSaveResult, SettingsSavedState } from '../shared/settings-save';
import type { Restarter } from './restart';
import { defaultSettingsPath } from './settings';
import { saveSettings, settingsFileExists } from './settings-write';
import type { DiffMode } from '../shared/types';
import { ApiError } from './github-client';
import { LOOKUP_MAX_REPOS } from './number-lookup';
import { dispatchBodyFor, Orca } from './orca';
import { streamSSE } from 'hono/streaming';
import { parseRef, REPO_RE, type InlineCommentArgs, type PrRef, type Provider, type SyncEvent } from './provider';
import { getCookie } from 'hono/cookie';
import type { AssetLinks } from './assetlinks';
import { parseApkParam } from '../shared/android-release';
import { DEV_BUILD, type UpdateSignal } from '../shared/build-update';
import { androidReleaseDir, APK_CONTENT_TYPE, APK_FILE, apkFileName, readRelease } from './android-release';
import { sendTestPush } from './notify-test';
import { TRIGGER_KEYS, type TriggerKey } from '../shared/notify-rules';
import { LiveClients, updatePhones } from './phone-updates';
import type { PushSender } from './push';
import type { DevicesResponse, PairCode } from '../shared/pairing';
import { DeviceStore, deviceNameFromUserAgent } from './devices';
import { PAIR_HTML } from './pair-pages';
import { PairingCodes } from './pairing';
import { ActivityStore } from './activity-store';
import type { ActionResult } from '../shared/types';
import { OrcaNotifier, type NotifyRequest } from './notify-orca';
import { OrcaPrefsStore } from './orca-prefs';
import { registerOrcaRoutes } from './orca-routes';
import { OrcaSessions } from './orca-sessions';
import type { SyncLoop } from './sync-loop';
import { AgentModelCatalog } from './agent-models';
import type { OrcaModelsResponse } from '../shared/agent-models';
import {
  DEVICE_COOKIE,
  deviceGuard,
  hostGuard,
  isTailnetRequest,
  loopbackOnly,
  mutationGuard,
  phoneOrigin,
  type PhoneAccess,
  setDeviceCookie,
} from './security';

export interface AppOptions {
  provider: Provider;
  port: number;
  token: string;
  /** Set when phone access is on; allows the tailnet host for its owner. */
  phone?: PhoneAccess;
  /** Paired phones. Defaults to an in-memory store, so only the entry points pass a file-backed one. */
  devices?: DeviceStore;
  /** Pairing codes and their rate limit. */
  pairing?: PairingCodes;
  /** Activity event log. Defaults to an in-memory store, so only the entry points pass a file-backed one. */
  activity?: ActivityStore;
  /** Public VAPID key for Web Push. Without it the push routes answer 404. */
  vapidPublicKey?: string;
  /** Sends Web Push. Set with `vapidPublicKey`; "Update phones" uses it for phones that are not connected. */
  pushSender?: PushSender;
  /** Served at `/.well-known/assetlinks.json` for the Android app. */
  assetLinks?: AssetLinks;
  /** The id of the front end being served, reported on `/api/health` and `/api/events`. */
  buildId?: string;
  /** Where `pnpm android:build` publishes the APK. Defaults to the state dir; tests pass a temp dir. */
  androidDir?: string;
  /** Built front end directory; omit in tests. */
  distDir?: string;
  /** Orca integration; defaults to a real detector. */
  orca?: Orca;
  /** Org-specific values; defaults when omitted. Served at `/api/settings`. */
  settings?: Settings;
  /** Where `PUT /api/settings` writes. Defaults to the file the settings load from. */
  settingsPath?: string;
  /** Restarts the service after a settings save. Without one the save only writes the file. */
  restart?: Restarter;
  /** Orca message switch, per-repo overrides and chosen sessions. Defaults to an in-memory store. */
  orcaPrefs?: OrcaPrefsStore;
  /** Cached Orca session reads. Defaults to one over `orca`. */
  orcaSessions?: OrcaSessions;
  /** The models each agent offers in Dispatch with Orca. Defaults to reading the CLIs. */
  agentModels?: Pick<AgentModelCatalog, 'get'>;
  /** The background sync, so a returning viewer can ask for a poll now. */
  sync?: Pick<SyncLoop, 'nudge'>;
  /** Hard timeout of an automatic Orca notification, ms. Tests shorten it. */
  orcaNotifyTimeoutMs?: number;
}

const SETTINGS_BODY_MAX = 64 * 1024;

const viewedBody = z.object({
  prId: z.string().min(1).max(200),
  path: z.string().min(1).max(1000),
  viewed: z.boolean(),
});
const reviewBody = z.object({
  repo: z.string(),
  number: z.number().int().positive(),
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
  body: z.string().max(65000).default(''),
});
/** Only the configured bot's command may be posted; the bot reads the comment as a command. */
const prCommentBodyFor = (command: string) =>
  z.object({
    repo: z.string(),
    number: z.number().int().positive(),
    body: z
      .string()
      .trim()
      .max(4000)
      .refine((v) => v.startsWith(command), `The comment must start with ${command}`),
  });
const pairBody = z.object({ code: z.string().min(1).max(200) });
const renameBody = z.object({ id: z.string().min(1).max(40), name: z.string().min(1).max(60) });
const revokeBody = z.object({ id: z.string().min(1).max(40) });
const pushSubscribeBody = z.object({
  endpoint: z.url().max(2000).startsWith('https://'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
/** Any subset of the trigger switches. Unknown keys are refused. */
const pushPrefsBody = z.strictObject(
  Object.fromEntries(TRIGGER_KEYS.map((k) => [k, z.boolean().optional()])) as Record<TriggerKey, z.ZodOptional<z.ZodBoolean>>,
);
const mergeBody =z.object({ repo: z.string(), number: z.number().int().positive() });
const rerunBody = z.object({
  repo: z.string(),
  number: z.number().int().positive(),
  runId: z.number().int().positive(),
  mode: z.enum(['failed', 'all']),
});
/** A line or file comment. A range needs both `startLine` and `startSide`; a file comment has no line. */
const inlineCommentBody = z
  .object({
    body: z.string().trim().min(1).max(65000),
    path: z.string().min(1).max(1000),
    line: z.number().int().positive().optional(),
    side: z.enum(['LEFT', 'RIGHT']).optional(),
    startLine: z.number().int().positive().optional(),
    startSide: z.enum(['LEFT', 'RIGHT']).optional(),
    subjectType: z.enum(['line', 'file']),
  })
  .superRefine((v, ctx) => {
    if (v.subjectType === 'file') {
      if (v.line !== undefined || v.side !== undefined || v.startLine !== undefined || v.startSide !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'A file comment takes no line' });
      }
      return;
    }
    if (v.line === undefined || v.side === undefined) {
      ctx.addIssue({ code: 'custom', message: 'A line comment needs line and side' });
    }
    if ((v.startLine === undefined) !== (v.startSide === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'startLine and startSide go together' });
    }
    if (v.startLine !== undefined && v.line !== undefined && v.startLine > v.line) {
      ctx.addIssue({ code: 'custom', message: 'startLine must not be after line' });
    }
  });
const threadIdBody = z.object({ threadId: z.string().min(1).max(200) });
const threadReplyBody = z.object({ threadId: z.string().min(1).max(200), body: z.string().trim().min(1).max(65000) });
const draftEditBody = z.object({ commentId: z.string().min(1).max(200), body: z.string().trim().min(1).max(65000) });
const draftDeleteBody = z.object({ commentId: z.string().min(1).max(200) });
const adminMergeBody = z.object({
  repo: z.string(),
  number: z.number().int().positive(),
  /** The PR number the user typed; must equal `number`. */
  confirm: z.number().int().positive(),
});
const seenBody = z.object({
  id: z.string().min(1).max(200),
  updatedAt: z.string().max(64),
  headSha: z.string().max(64),
  commitCount: z.number().int().nonnegative(),
});

const repoName = z.string().regex(REPO_RE);
const issueRef = { repo: repoName, number: z.number().int().positive() };
const names = z.array(z.string().min(1).max(200)).max(50);
const nodeId = z.string().regex(/^[A-Za-z0-9_=/-]{1,128}$/);
const issueActionBodyFor = (statuses: readonly string[]) => z.discriminatedUnion('type', [
  z.object({ type: z.literal('comment'), ...issueRef, body: z.string().min(1).max(65000) }),
  z.object({
    type: z.literal('close'),
    ...issueRef,
    reason: z.enum(['COMPLETED', 'NOT_PLANNED']),
    comment: z.string().max(65000).optional(),
  }),
  z.object({ type: z.literal('reopen'), ...issueRef }),
  z.object({ type: z.literal('labels'), ...issueRef, add: names, remove: names }),
  z.object({ type: z.literal('assignees'), ...issueRef, add: names, remove: names }),
  z.object({ type: z.literal('milestone'), ...issueRef, milestone: z.string().min(1).max(200).nullable() }),
  z.object({ type: z.literal('title'), ...issueRef, title: z.string().min(1).max(256) }),
  z.object({ type: z.literal('start'), ...issueRef }),
  z.object({ type: z.literal('stop'), ...issueRef }),
  z.object({ type: z.literal('status'), ...issueRef, status: z.string().refine((s) => statuses.includes(s), 'Unknown status') }),
  z.object({ type: z.literal('bot'), ...issueRef }),
  z.object({ type: z.literal('create-label'), repo: repoName, name: z.string().trim().min(1).max(50) }),
  z.object({
    type: z.literal('create'),
    repo: repoName,
    title: z.string().min(1).max(256),
    body: z.string().max(65000).default(''),
    labels: names,
    assignees: names,
  }),
  z.object({
    type: z.literal('sub-create'),
    ...issueRef,
    childRepo: repoName,
    title: z.string().trim().min(1).max(256),
    body: z.string().max(65000).default(''),
  }),
  z.object({
    type: z.literal('sub-add'),
    ...issueRef,
    childRepo: repoName,
    childNumber: z.number().int().positive(),
    replaceParent: z.boolean().default(false),
  }),
  z
    .object({ type: z.literal('sub-move'), ...issueRef, childId: nodeId, afterId: nodeId.optional(), beforeId: nodeId.optional() })
    .refine((m) => (m.afterId === undefined) !== (m.beforeId === undefined), 'Give afterId or beforeId'),
  z.object({ type: z.literal('sub-remove'), ...issueRef, childId: nodeId }),
]);
const markdownBody = z.object({ repo: repoName, text: z.string().min(1).max(65536) });
const issueSeenBody = z.object({
  id: z.string().min(1).max(200),
  updatedAt: z.string().max(64),
  commentCount: z.number().int().nonnegative(),
});

/** GitHub API errors carry GitHub's own text. Anything else may hold local paths, so it stays in the log. */
export function message(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  console.error('[server] unhandled error:', e);
  return 'Internal error. See the server log.';
}

export function createApp(opts: AppOptions): Hono {
  const { provider, token, distDir, phone } = opts;
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const orca = opts.orca ?? new Orca({ settings });
  const issueActionBody = issueActionBodyFor(statusNames(settings));
  const dispatchSchema = dispatchBodyFor(settings.orcaAgents);
  const prCommentBody = prCommentBodyFor(settings.bot.command);
  const devices = opts.devices ?? DeviceStore.memory();
  const codes = opts.pairing ?? new PairingCodes();
  const activity = opts.activity ?? ActivityStore.memory();
  const orcaPrefs = opts.orcaPrefs ?? OrcaPrefsStore.memory();
  const agentModels = opts.agentModels ?? new AgentModelCatalog({ fixtures: orca.fake !== undefined });
  const orcaSessions = opts.orcaSessions ?? new OrcaSessions(orca);
  const notifier = new OrcaNotifier({
    orca,
    sessions: orcaSessions,
    prefs: orcaPrefs,
    activity,
    provider,
    ...(opts.orcaNotifyTimeoutMs ? { timeoutMs: opts.orcaNotifyTimeoutMs } : {}),
  });
  /**
   * Starts the Orca notification for a finished action and tags the response with its id. The action's
   * own result is returned unchanged otherwise, and a failed action never notifies.
   */
  const notify = <T extends ActionResult>(res: T, req: NotifyRequest | undefined): T => {
    if (!res.ok || !req) return res;
    const noticeId = notifier.start(req);
    return noticeId ? { ...res, noticeId } : res;
  };
  const phoneUrl = phone ? phoneOrigin(phone.host) : undefined;
  const build = opts.buildId ?? DEV_BUILD;
  const androidDir = opts.androidDir ?? androidReleaseDir();
  const live = new LiveClients();
  const app = new Hono();

  app.use('*', hostGuard(phone));
  app.use('*', deviceGuard(devices));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  const state = (c: Context) => c.req.query('state');

  // Reads serve the server's saved lists. Only the server loop and Refresh reach GitHub.
  app.get('/api/inbox', async (c) => c.json(await provider.inbox(state(c), 'none')));

  // The log diffs the saved lists, so it reads them on every sync notice and on every request.
  const observe = async (query: string | undefined) => {
    const inbox = await provider.inbox(query, 'none');
    activity.observe(inbox, await provider.issues(query));
  };
  provider.subscribe((e) => {
    if (!e.syncing) void observe(undefined).catch(() => undefined);
  });

  app.get('/api/activity', async (c) => {
    await observe(state(c));
    return c.json(activity.feed(Number(c.req.query('days') ?? 7)));
  });

  // A phone's stream names its device, so "Update phones" knows who is listening. The app adds
  // `?apk=<versionCode>` so the server knows which phones run an old APK.
  app.get('/api/events', async (c) => {
    const key = isTailnetRequest(c) ? getCookie(c, DEVICE_COOKIE) : undefined;
    const deviceId = key ? devices.idForKey(key) : undefined;
    const apk = parseApkParam(new URL(c.req.url).search);
    if (key && deviceId && apk) await devices.setApk(key, apk).catch(() => undefined);
    return streamSSE(c, async (stream) => {
      const send = (e: SyncEvent) => stream.writeSSE({ event: 'sync', data: JSON.stringify(e) });
      const signal = (s: UpdateSignal) => stream.writeSSE({ event: s.kind, data: JSON.stringify(s) });
      const off = provider.subscribe((e) => void send(e));
      const leave = live.add({ deviceId, send: signal });
      stream.onAbort(() => {
        off();
        leave();
      });
      await signal({ kind: 'build', build });
      await send(provider.syncState());
      while (!stream.aborted) {
        await stream.sleep(25_000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  app.get('/api/pr/:owner/:name/:number', async (c) => {
    const ref = parseRef(`${c.req.param('owner')}/${c.req.param('name')}`, c.req.param('number'));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    return c.json(await provider.detail(ref, state(c)));
  });

  app.get('/api/pr/:owner/:name/:number/diff', async (c) => {
    const ref = parseRef(`${c.req.param('owner')}/${c.req.param('name')}`, c.req.param('number'));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const mode: DiffMode = c.req.query('mode') === 'since' ? 'since' : 'all';
    return c.json(await provider.diff(ref, mode, state(c)));
  });

  app.get('/api/issues', async (c) => c.json(await provider.issues(state(c))));

  // Closed items: one separate read per page, loaded when the section opens. Never on the poll loop.
  app.get('/api/closed/:kind', async (c) => {
    const kind = c.req.param('kind');
    if (kind !== 'prs' && kind !== 'issues') return c.json({ error: 'Bad kind' }, 400);
    const window = Number(c.req.query('window') ?? DEFAULT_CLOSED_WINDOW);
    if (!isClosedWindow(window)) return c.json({ error: 'Bad window' }, 400);
    const after = c.req.query('after') || undefined;
    if (after !== undefined && !/^[A-Za-z0-9+/=_-]{1,200}$/.test(after)) return c.json({ error: 'Bad cursor' }, 400);
    return c.json(await provider.closed(kind, window, after, state(c)));
  });

  app.get('/api/issue/:owner/:name/:number', async (c) => {
    const ref = parseRef(`${c.req.param('owner')}/${c.req.param('name')}`, c.req.param('number'));
    if (!ref) return c.json({ error: 'Bad issue reference' }, 400);
    return c.json(await provider.issueDetail(ref, state(c)));
  });

  app.get('/api/repo-meta/:owner/:name', async (c) => {
    const repo = `${c.req.param('owner')}/${c.req.param('name')}`;
    if (!REPO_RE.test(repo)) return c.json({ error: 'Bad repository' }, 400);
    return c.json(await provider.repoMeta(repo, state(c)));
  });

  app.get('/api/mentionable/:owner/:name', async (c) => {
    const repo = `${c.req.param('owner')}/${c.req.param('name')}`;
    if (!REPO_RE.test(repo)) return c.json({ error: 'Bad repository' }, 400);
    const cursor = c.req.query('cursor') || undefined;
    if (cursor !== undefined && !/^[A-Za-z0-9+/=_-]{1,200}$/.test(cursor)) return c.json({ error: 'Bad cursor' }, 400);
    return c.json(await provider.mentionable(repo, cursor, state(c)));
  });

  app.get('/api/lookup/:number', async (c) => {
    const number = Number(c.req.param('number'));
    const repos = (c.req.query('repos') ?? '').split(',').filter((r) => REPO_RE.test(r));
    if (!Number.isSafeInteger(number) || number < 1) return c.json({ error: 'Bad number' }, 400);
    if (repos.length === 0 || repos.length > LOOKUP_MAX_REPOS) return c.json({ error: 'Bad repo list' }, 400);
    return c.json({ hits: await provider.lookup(number, repos, state(c)) });
  });

  app.get('/api/settings', (c) => c.json(settings));

  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  app.get('/api/settings/saved', async (c) => {
    const body: SettingsSavedState = { saved: await settingsFileExists(settingsPath) };
    return c.json(body);
  });

  // Private-repo images need the server's GitHub credentials, which the browser lacks.
  app.get('/api/image', async (c) => {
    const target = parseImageUrl(c.req.query('u') ?? '', settings.orgs);
    if (!target) return c.json({ error: 'Image URL not allowed' }, 400);
    try {
      const img = await provider.image(target);
      c.header('Content-Type', img.contentType);
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Cache-Control', 'private, max-age=300');
      return c.body(img.bytes as Uint8Array<ArrayBuffer>);
    } catch (e) {
      const status = e instanceof ApiError && e.status === 413 ? 413 : 502;
      return c.json({ error: message(e) }, status);
    }
  });

  app.get('/api/orca', async (c) => {
    const status = await orca.status();
    return c.json({ ...status, repos: status.available ? await orca.mappedRepos() : undefined });
  });

  /** The desktop (or a wrapper) checks this to find a running service. */
  app.get('/api/health', (c) => c.json({ app: 'nod', build }));

  // The published APK and its metadata. Tailnet requests reach these only with a device key.
  app.get('/api/android/latest', async (c) => {
    const release = await readRelease(androidDir);
    return release ? c.json(release) : c.json({ error: 'No Android build published' }, 404);
  });

  app.get('/api/android/nod.apk', async (c) => {
    const release = await readRelease(androidDir);
    const bytes = release ? await readFile(join(androidDir, APK_FILE)).catch(() => undefined) : undefined;
    if (!release || !bytes) return c.json({ error: 'No Android build published' }, 404);
    c.header('Content-Type', APK_CONTENT_TYPE);
    c.header('Content-Disposition', `attachment; filename="${apkFileName(release)}"`);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(bytes as Uint8Array<ArrayBuffer>);
  });

  app.get('/pair', (c) => c.html(PAIR_HTML));

  app.get('/.well-known/assetlinks.json', (c) =>
    opts.assetLinks ? c.json(opts.assetLinks) : c.json({ error: 'Android app not built' }, 404),
  );

  app.get('/api/push/key', (c) =>
    opts.vapidPublicKey ? c.json({ publicKey: opts.vapidPublicKey }) : c.json({ error: 'Push is off' }, 404),
  );

  // A phone trades the one-time code for its device key. No session token yet, so this sits before the mutation guard.
  app.post('/api/pair', async (c) => {
    if (!phone || !isTailnetRequest(c)) return c.json({ error: 'Phone pairing is off' }, 403);
    if (!codes.allow()) return c.json({ error: 'Too many tries. Wait a minute' }, 429);
    const parsed = pairBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !codes.consume(parsed.data.code)) {
      return c.json({ error: 'That code is wrong or expired' }, 403);
    }
    const key = await devices.add(deviceNameFromUserAgent(c.req.header('user-agent')));
    setDeviceCookie(c, key);
    return c.json({ ok: true });
  });

  app.get('/api/devices', loopbackOnly, (c) => {
    const body: DevicesResponse = { phoneUrl, devices: devices.list() };
    return c.json(body);
  });

  const mutating = new Hono();
  mutating.use('*', mutationGuard(token, phone));

  mutating.post('/pair/code', loopbackOnly, (c) => {
    if (!phoneUrl) return c.json({ error: 'Phone access is off' }, 409);
    const { code, expiresAt } = codes.create();
    const body: PairCode = {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      link: `${phoneUrl}/pair#code=${code}`,
    };
    return c.json(body);
  });

  // The one write to the settings file. Loopback only, so a paired phone cannot change the org or the bot.
  mutating.put('/settings', loopbackOnly, async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > SETTINGS_BODY_MAX) {
      return c.json({ error: 'Settings body too large' }, 413);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Body must be JSON' }, 400);
    }
    const saved = await saveSettings(settingsPath, body);
    if (!saved.ok) return c.json({ error: saved.error }, saved.status);
    opts.restart?.run();
    const result: SettingsSaveResult = {
      ok: true,
      restarting: opts.restart !== undefined,
      mode: opts.restart?.mode ?? 'none',
    };
    return c.json(result);
  });

  mutating.post('/devices/rename', loopbackOnly, async (c) => {
    const parsed = renameBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ok = await devices.rename(parsed.data.id, parsed.data.name);
    return ok ? c.json({ ok }) : c.json({ error: 'No such device' }, 404);
  });

  mutating.post('/devices/revoke', loopbackOnly, async (c) => {
    const parsed = revokeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ok = await devices.revoke(parsed.data.id);
    return ok ? c.json({ ok }) : c.json({ error: 'No such device' }, 404);
  });

  // The desktop's "Update phones". Loopback only, like pairing, so a phone cannot reload the others.
  mutating.post('/phones/update', loopbackOnly, async (c) =>
    c.json(
      await updatePhones({
        live,
        devices,
        send: opts.vapidPublicKey ? opts.pushSender : undefined,
        build,
        release: await readRelease(androidDir),
      }),
    ),
  );

  // The desktop's "Send test notification". Loopback only, so a phone cannot buzz the others.
  mutating.post('/notifications/test', loopbackOnly, async (c) =>
    c.json(await sendTestPush(devices, opts.vapidPublicKey ? opts.pushSender : undefined)),
  );

  // Push subscriptions belong to the paired phone whose cookie sends the request.
  mutating.post('/push/subscribe', async (c) => {
    const key = getCookie(c, DEVICE_COOKIE);
    const parsed = pushSubscribeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    if (!key || !(await devices.setPush(key, parsed.data))) return c.json({ error: 'Not paired' }, 401);
    return c.json({ ok: true });
  });

  mutating.post('/push/unsubscribe', async (c) => {
    const key = getCookie(c, DEVICE_COOKIE);
    if (!key || !(await devices.setPush(key, undefined))) return c.json({ error: 'Not paired' }, 401);
    return c.json({ ok: true });
  });

  // Notification switches belong to the paired phone whose cookie sends the request, and no other.
  app.get('/api/push/prefs', (c) => {
    const key = getCookie(c, DEVICE_COOKIE);
    const switches = key ? devices.notifySwitches(key) : undefined;
    return switches ? c.json(switches) : c.json({ error: 'Not paired' }, 401);
  });

  mutating.post('/push/prefs', async (c) => {
    const key = getCookie(c, DEVICE_COOKIE);
    const parsed = pushPrefsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const switches = key ? await devices.setNotifySwitches(key, patch) : undefined;
    return switches ? c.json(switches) : c.json({ error: 'Not paired' }, 401);
  });

  mutating.post('/refresh', async (c) => {
    await provider.refresh();
    return c.json({ ok: true });
  });

  // A cheap delta poll when a viewer comes back; the loop drops it if one ran in the last 10 s.
  mutating.post('/sync/nudge', (c) => c.json({ polled: opts.sync?.nudge() ?? false }));

  mutating.post('/viewed', async (c) => {
    const parsed = viewedBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const { prId, path, viewed } = parsed.data;
    return c.json(await provider.setViewed(prId, path, viewed));
  });

  // The body is the raw image. Its bytes are passed to GitHub and never logged or kept.
  mutating.post(
    '/upload-image',
    bodyLimit({ maxSize: UPLOAD_MAX_BYTES, onError: (c) => c.json({ error: 'Images must be 10 MB or smaller' }, 413) }),
    async (c) => {
      const repo = c.req.query('repo') ?? '';
      if (!REPO_RE.test(repo)) return c.json({ error: 'Bad repository' }, 400);
      const type = (c.req.header('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
      if (!isUploadType(type)) return c.json({ error: 'Only PNG, JPEG, GIF and WebP images can be uploaded' }, 415);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength === 0) return c.json({ error: 'The image is empty' }, 400);
      if (sniffImageType(bytes) !== type) return c.json({ error: 'The file is not the image type it claims to be' }, 415);
      try {
        return c.json(await provider.uploadImage(repo, uploadName(c.req.query('name') ?? '', type), type, bytes));
      } catch (e) {
        return c.json({ error: message(e) }, 502);
      }
    },
  );

  mutating.post('/review', async (c) => {
    const parsed = reviewBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ref = parseRef(parsed.data.repo, String(parsed.data.number));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const res = await provider.review(ref, parsed.data.event, parsed.data.body, state(c));
    const kind = { APPROVE: 'approve', REQUEST_CHANGES: 'request-changes', COMMENT: 'comment' } as const;
    return c.json(notify(res, { kind: kind[parsed.data.event], ...ref, state: state(c) }));
  });

  mutating.post('/pr-comment', async (c) => {
    if (!settings.bot.enabled) return c.json({ error: 'No bot is configured' }, 400);
    const parsed = prCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, 400);
    const ref = parseRef(parsed.data.repo, String(parsed.data.number));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    return c.json(notify(await provider.comment(ref, parsed.data.body), { kind: 'comment', ...ref, state: state(c) }));
  });

  mutating.post('/merge', async (c) => {
    const parsed = mergeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ref = parseRef(parsed.data.repo, String(parsed.data.number));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    return c.json(notify(await provider.merge(ref), { kind: 'auto-merge-on', ...ref, state: state(c) }));
  });

  mutating.post('/admin-merge', async (c) => {
    const parsed = adminMergeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || parsed.data.confirm !== parsed.data.number) {
      return c.json({ error: 'Bad request' }, 400);
    }
    const ref = parseRef(parsed.data.repo, String(parsed.data.number));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    return c.json(notify(await provider.adminMerge(ref), { kind: 'admin-merge', ...ref, state: state(c) }));
  });

  mutating.post('/ready', async (c) => {
    const parsed = mergeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ref = parseRef(parsed.data.repo, String(parsed.data.number));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const res = await provider.markReady(ref);
    // "Already ready" changed nothing, so nobody is told.
    const changed = res.message !== 'Already ready for review';
    return c.json(notify(res, changed ? { kind: 'ready', ...ref, state: state(c) } : undefined));
  });

  mutating.post('/rerun', async (c) => {
    const parsed = rerunBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ref = parseRef(parsed.data.repo, String(parsed.data.number));
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const res = await provider.rerun({ ...ref, runId: parsed.data.runId, mode: parsed.data.mode });
    return c.json(res);
  });

  // Inline comments. Each route takes the PR from the path, validates the body, and returns the
  // provider's ActionResult. The provider invalidates the cached detail. See docs/api-comments.md.
  const inlineRef = (c: Context) => parseRef(`${c.req.param('owner')}/${c.req.param('name')}`, c.req.param('number') ?? '');
  /** The validated body as provider args. `inlineCommentBody` guarantees line and side on a line comment. */
  const inlineArgs = (ref: PrRef, b: z.infer<typeof inlineCommentBody>): InlineCommentArgs => {
    if (b.subjectType === 'file') return { ...ref, body: b.body, path: b.path, subjectType: 'file', line: 0, side: 'RIGHT' };
    return { ...ref, ...b, line: b.line ?? 0, side: b.side ?? 'RIGHT' };
  };

  mutating.post('/pr/:owner/:name/:number/comments/inline', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = inlineCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, 400);
    return c.json(await provider.addReviewComment(inlineArgs(ref, parsed.data)));
  });

  mutating.post('/pr/:owner/:name/:number/comments/draft', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = inlineCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, 400);
    return c.json(await provider.addDraftComment(inlineArgs(ref, parsed.data)));
  });

  mutating.post('/pr/:owner/:name/:number/threads/reply', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = threadReplyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    return c.json(await provider.replyToThread({ ...ref, ...parsed.data }));
  });

  mutating.post('/pr/:owner/:name/:number/threads/resolve', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = threadIdBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    return c.json(await provider.resolveThread({ ...ref, ...parsed.data }));
  });

  mutating.post('/pr/:owner/:name/:number/threads/unresolve', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = threadIdBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    return c.json(await provider.unresolveThread({ ...ref, ...parsed.data }));
  });

  mutating.post('/pr/:owner/:name/:number/drafts/edit', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = draftEditBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    return c.json(await provider.editDraftComment({ ...ref, ...parsed.data }));
  });

  mutating.post('/pr/:owner/:name/:number/drafts/delete', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    const parsed = draftDeleteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    return c.json(await provider.deleteDraftComment({ ...ref, ...parsed.data }));
  });

  mutating.post('/pr/:owner/:name/:number/review/discard', async (c) => {
    const ref = inlineRef(c);
    if (!ref) return c.json({ error: 'Bad PR reference' }, 400);
    return c.json(await provider.discardPendingReview(ref));
  });

  // Markdown preview for comment composers. GitHub renders and sanitises the HTML.
  mutating.post('/markdown', async (c) => {
    const parsed = markdownBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    return c.json(await provider.renderMarkdown(parsed.data));
  });

  mutating.post('/activity/visit', (c) => c.json({ lastVisit: activity.visit() }));

  mutating.post('/seen', async (c) => {
    const parsed = seenBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    await provider.markSeen(parsed.data);
    return c.json({ ok: true });
  });

  mutating.post('/issue-action', async (c) => {
    const parsed = issueActionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const a = parsed.data;
    const res = await provider.issueAction(a);
    const req: NotifyRequest | undefined =
      a.type === 'close'
        ? { kind: 'issue-close', repo: a.repo, number: a.number, reason: a.reason === 'NOT_PLANNED' ? 'not-planned' : 'completed', state: state(c) }
        : a.type === 'reopen'
          ? { kind: 'issue-reopen', repo: a.repo, number: a.number, state: state(c) }
          : undefined;
    return c.json(notify(res, req));
  });

  mutating.post('/issue-seen', async (c) => {
    const parsed = issueSeenBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    await provider.markIssueSeen(parsed.data);
    return c.json({ ok: true });
  });

  // The dialog sends the model it shows and that choice is remembered. A request with no model
  // (the phone's one-tap dispatch) uses the one remembered for the agent.
  mutating.post('/orca/dispatch', async (c) => {
    const parsed = dispatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const body = parsed.data;
    const chosen = body.model !== undefined;
    const remembered = orcaPrefs.get().dispatch[body.agent];
    const req = chosen ? body : { ...body, ...remembered };
    const res = await orca.dispatch(req);
    if (res.ok && chosen) {
      orcaPrefs.rememberDispatch(body.agent, { ...(body.model ? { model: body.model } : {}), ...(body.effort ? { effort: body.effort } : {}) });
    }
    return res.ok ? c.json(res) : c.json({ error: res.message }, 502);
  });

  app.get('/api/orca/models', async (c) => {
    const prefs = orcaPrefs.get();
    return c.json({
      models: await agentModels.get(),
      remembered: prefs.dispatch,
      ...(prefs.lastAgent ? { lastAgent: prefs.lastAgent } : {}),
    } satisfies OrcaModelsResponse);
  });

  registerOrcaRoutes(app, mutating, { orca, sessions: orcaSessions, prefs: orcaPrefs, notifier, provider });

  app.route('/api', mutating);

  app.onError((e, c) => c.json({ error: message(e) }, 500));

  if (distDir) {
    const rel = relative(process.cwd(), distDir);
    app.use('/assets/*', serveStatic({ root: rel }));
    app.use('/icons/*', serveStatic({ root: rel }));
    app.use('/manifest.webmanifest', serveStatic({ root: rel }));
    app.use('/sw.js', async (c, next) => {
      c.header('Cache-Control', 'no-cache');
      await next();
    });
    app.use('/sw.js', serveStatic({ root: rel }));
    app.get('*', async (c) => {
      const html = await readFile(join(distDir, 'index.html'), 'utf8');
      return c.html(html.replace('__NOD_TOKEN__', token));
    });
  } else {
    app.get('/', (c) => c.text('Nod api'));
  }
  return app;
}
