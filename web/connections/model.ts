import type { ConnectionsBody, DeviceLink } from '../../shared/connections';
import { formatClock, type ClockFormat } from '../time-format';

/** Row marks differ by shape: filled disc, ring, dashed ring, triangle, circled `!`. `hub` is the phone rail's accent ring. */
export type Mark = 'ok' | 'off' | 'checking' | 'warn' | 'broken' | 'hub';
export type ChipTone = 'ok' | 'neutral' | 'attention' | 'danger' | 'checking';
export type RowAction = 'details' | 'fix' | 'copy' | 'setup' | 'rename';
export type LinkState = 'ok' | 'off' | 'broken';

export interface ConnRow {
  key: string;
  name: string;
  mark: Mark;
  detail: string;
  /** The detail is a URL, set in monospace. */
  mono?: boolean;
  action?: RowAction;
  deviceId?: string;
}

export interface Chip {
  tone: ChipTone;
  label: string;
  /** Below 1500 wide the chip shows the mark and this count only. */
  short: string;
}

export const HUB_DOCS_URL = 'https://github.com/Deetss/nod/blob/main/docs/hub.md';
export const CHECKING = 'Checking…';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LOW_BUDGET = 0.1;
const DEVICE_LIMIT = 4;

export interface Ctx {
  now: number;
  clock: ClockFormat;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (n: number) => n.toLocaleString('en-US');

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** `9:00 AM` today, `Nov 10` before. */
export function whenText(iso: string | number, ctx: Ctx): string {
  const d = new Date(iso);
  return sameDay(d, new Date(ctx.now)) ? formatClock(d, ctx.clock) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `2m ago`, as the top bar's sync text. */
export function ageText(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

/** `v0.2.32` as is, a hash build as `Build 8152277`. */
export function versionText(build: string): string {
  if (build === 'dev') return 'Dev build';
  return /^v?\d+\.\d+\.\d+$/.test(build) ? (build.startsWith('v') ? build : `v${build}`) : `Build ${build.slice(0, 7)}`;
}

const apiText = (b: ConnectionsBody) => {
  const r = b.github.rate;
  return r ? `API ${num(r.remaining)} / ${num(r.limit)}.` : '';
};

const lowBudget = (b: ConnectionsBody) => {
  const r = b.github.rate;
  return r !== undefined && r.limit > 0 && r.remaining / r.limit < LOW_BUDGET;
};

export function githubBroken(b: ConnectionsBody): boolean {
  const g = b.github;
  return g.state === 'none' || g.state === 'required' || g.error !== undefined;
}

export function githubRow(b: ConnectionsBody): ConnRow {
  const g = b.github;
  const row = { key: 'github', name: 'GitHub' };
  if (g.state === 'none') return { ...row, mark: 'broken', detail: 'No GitHub token. Log in with gh.', action: 'fix' };
  if (g.state === 'required') return { ...row, mark: 'broken', detail: 'The token lacks the repo scope.', action: 'fix' };
  if (g.error !== undefined) {
    const n = Math.max(1, g.failures);
    const lead = n > 1 ? `Last ${n} syncs failed` : 'Last sync failed';
    return { ...row, mark: 'broken', detail: `${lead}: ${g.error}`, action: 'fix' };
  }
  if (g.missing.length > 0) {
    const scopes = g.missing.join(' and ');
    return { ...row, mark: 'warn', detail: `Missing the ${scopes} ${g.missing.length > 1 ? 'scopes' : 'scope'}. ${apiText(b)}`.trim(), action: 'details' };
  }
  if (lowBudget(b)) return { ...row, mark: 'warn', detail: `API budget under 10%. ${apiText(b)}`, action: 'details' };
  const scopes = g.state === 'unknown' ? 'Scopes unknown.' : 'All scopes on.';
  return { ...row, mark: 'ok', detail: `${scopes} ${apiText(b)}`.trim(), action: 'details' };
}

function syncText(b: ConnectionsBody, ctx: Ctx): string {
  return b.github.syncedAt > 0 ? `Synced ${ageText(b.github.syncedAt, ctx.now)}` : 'Not synced yet';
}

export function nodRow(b: ConnectionsBody, ctx: Ctx): ConnRow {
  const v = versionText(b.nod.build);
  const detail =
    b.nod.mode === 'own'
      ? `${v}. Own server on port ${b.nod.port}.`
      : `${v}. ${syncText(b, ctx)}, ${b.github.failures > 0 ? 'last sync failed' : 'no errors'}.`;
  return { key: 'nod', name: 'This Nod', mark: 'ok', detail };
}

/** Phone access on, but Serve does not reach this Nod. */
export function tailscaleBroken(b: ConnectionsBody): boolean {
  return b.tailscale.on && b.tailscale.serve !== 'served';
}

export function tailscaleRow(b: ConnectionsBody): ConnRow {
  const t = b.tailscale;
  const row = { key: 'tailscale', name: 'Tailscale' };
  if (!t.on) return { ...row, mark: 'off', detail: 'Phone access is off.', action: 'setup' };
  if (t.serve === 'elsewhere') return { ...row, mark: 'broken', detail: `Serve points elsewhere, not port ${b.nod.port}.`, action: 'setup' };
  if (t.serve === 'off') return { ...row, mark: 'broken', detail: 'Tailscale Serve is off.', action: 'setup' };
  if (t.reachable === false) return { ...row, mark: 'warn', detail: 'Served, but the check through it failed.', action: 'copy' };
  return { ...row, mark: 'ok', detail: t.url ?? '', mono: true, action: 'copy' };
}

export function deviceRow(d: DeviceLink, ctx: Ctx): ConnRow {
  const push = d.push ? 'Push on.' : 'Push off.';
  const stale = ctx.now - Date.parse(d.lastSeen) > WEEK_MS;
  return {
    key: `device:${d.id ?? d.name}`,
    name: d.name,
    mark: stale ? 'warn' : d.push ? 'ok' : 'off',
    detail: stale ? `Not seen since ${whenText(d.lastSeen, ctx)}. ${push}` : `Seen ${whenText(d.lastSeen, ctx)}. ${push}`,
    ...(d.id ? { action: 'rename' as const, deviceId: d.id } : {}),
  };
}

export function orcaRow(b: ConnectionsBody, where: 'here' | 'hub' = 'here'): ConnRow {
  const o = b.orca;
  const name = where === 'hub' ? 'Orca on the hub' : 'Orca';
  if (!o.running) return { key: 'orca', name, mark: 'off', detail: where === 'hub' ? 'Not running on the hub.' : 'Not running on this machine.' };
  const repos = o.repos !== undefined ? ` ${plural(o.repos, 'repo')},` : '';
  return { key: 'orca', name, mark: 'ok', detail: `Running${where === 'here' ? ' here' : ''}.${repos} ${plural(o.sessions, 'session')}.` };
}

const NO_DEVICES: ConnRow = { key: 'devices', name: 'Devices', mark: 'off', detail: 'No devices paired.' };

/** The popover rows, broken rows first. Past four devices the rest fold into `hidden`. */
export function desktopRows(b: ConnectionsBody, ctx: Ctx): { rows: ConnRow[]; hidden: ConnRow[] } {
  const devices = b.devices.map((d) => deviceRow(d, ctx));
  const shown = devices.slice(0, DEVICE_LIMIT);
  const hidden = devices.slice(DEVICE_LIMIT);
  const rows = [githubRow(b), nodRow(b, ctx), tailscaleRow(b), ...(devices.length ? shown : [NO_DEVICES]), orcaRow(b)];
  return { rows: [...rows.filter((r) => r.mark === 'broken'), ...rows.filter((r) => r.mark !== 'broken')], hidden };
}

export const CHECKING_ROWS: ConnRow[] = [
  { key: 'github', name: 'GitHub', mark: 'checking', detail: CHECKING },
  { key: 'nod', name: 'This Nod', mark: 'checking', detail: CHECKING },
  { key: 'tailscale', name: 'Tailscale', mark: 'checking', detail: CHECKING },
  { key: 'devices', name: 'Devices', mark: 'checking', detail: CHECKING },
  { key: 'orca', name: 'Orca', mark: 'checking', detail: CHECKING },
];

/** Every row that counts toward the chip. */
function allRows(b: ConnectionsBody, ctx: Ctx): ConnRow[] {
  return [githubRow(b), nodRow(b, ctx), tailscaleRow(b), ...b.devices.map((d) => deviceRow(d, ctx)), orcaRow(b)];
}

const BROKEN_LABEL: Record<string, string> = { github: 'Sync failing', tailscale: 'Tailscale off', orca: 'Orca unreachable' };

/** Worst state wins: danger, then warnings, then phone access off, then all good. */
export function chipFor(b: ConnectionsBody | undefined, ctx: Ctx): Chip {
  if (!b) return { tone: 'checking', label: CHECKING, short: '' };
  const rows = allRows(b, ctx);
  const broken = rows.filter((r) => r.mark === 'broken');
  if (broken[0]) return { tone: 'danger', label: BROKEN_LABEL[broken[0].key] ?? broken[0].name, short: String(broken.length) };
  const warns = rows.filter((r) => r.mark === 'warn').length;
  if (warns > 0) return { tone: 'attention', label: plural(warns, 'warning'), short: String(warns) };
  const n = b.devices.length;
  if (!b.tailscale.on) return { tone: 'neutral', label: 'This machine only', short: String(n) };
  return { tone: 'ok', label: `${b.nod.mode === 'service' ? 'Service' : 'Local'} · ${plural(n, 'device')}`, short: String(n) };
}

/** B1: the hub is down and this window runs on this machine. Wins over every other state. */
export const LOCAL_MODE_CHIP: Chip = { tone: 'attention', label: 'Local mode · hub down', short: '' };

export function subtitle(b: ConnectionsBody | undefined): string {
  if (!b) return CHECKING;
  return b.nod.mode === 'service' ? 'This window uses the Nod service on this machine.' : 'This window runs its own server.';
}

export interface StripNode {
  name: string;
  detail: string;
  state: 'on' | 'off' | 'broken' | 'here';
}

export interface Strip {
  github: StripNode;
  nod: StripNode;
  tailscale: StripNode;
  devices: StripNode;
  orca: StripNode;
  links: { github: LinkState; tailscale: LinkState; devices: LinkState; orca: LinkState };
}

const httpsPort = (url: string | undefined) => (url ? new URL(url).port || '443' : '443');

export function stripFor(b: ConnectionsBody | undefined): Strip {
  if (!b) {
    // Lower case and no ellipsis, like the other node details, so it fits the 84px Devices node.
    const node = (name: string): StripNode => ({ name, detail: 'checking', state: 'off' });
    return {
      github: node('GitHub'),
      nod: { ...node('This Nod'), state: 'here' },
      tailscale: node('Tailscale'),
      devices: node('Devices'),
      orca: node('Orca'),
      links: { github: 'off', tailscale: 'off', devices: 'off', orca: 'off' },
    };
  }
  const gh = githubBroken(b);
  const served = b.tailscale.on && b.tailscale.serve === 'served';
  const tsBroken = tailscaleBroken(b);
  const n = b.devices.length;
  return {
    github: { name: 'GitHub', detail: gh ? 'Sync failing' : (b.github.login ?? 'logged in'), state: gh ? 'broken' : 'on' },
    nod: { name: 'This Nod', detail: b.nod.mode === 'service' ? `service :${b.nod.port}` : 'own server', state: 'here' },
    tailscale: {
      name: 'Tailscale',
      detail: served ? `serve ${httpsPort(b.tailscale.url)}` : 'not served',
      state: tsBroken ? 'broken' : served ? 'on' : 'off',
    },
    devices: { name: 'Devices', detail: n > 0 ? `${n} paired` : 'none', state: served && n > 0 ? 'on' : 'off' },
    orca: {
      name: 'Orca',
      detail: b.orca.running ? plural(b.orca.sessions, 'session') : 'not running',
      state: b.orca.running ? 'on' : 'off',
    },
    links: {
      github: gh ? 'broken' : 'ok',
      tailscale: tsBroken ? 'broken' : served ? 'ok' : 'off',
      devices: served && n > 0 ? 'ok' : 'off',
      orca: b.orca.running ? 'ok' : 'off',
    },
  };
}
