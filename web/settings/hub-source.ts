import { hubStatusFrom, type CheckResult, type HubStatus, type PairResult } from '../../shared/hub';
import { STATE_PARAM } from '../api';

/**
 * Where Settings > Hub reads and writes. The desktop's own page goes through the shell,
 * which saves the Hub URL and pairs. A desktop showing the hub may only look: the shell
 * refuses hub changes from the hub's page, so it checks its role on the hub directly.
 */
export interface HubSource {
  /** True when this page may change the Hub URL and pair. */
  editable: boolean;
  url: () => Promise<{ url: string; attached: boolean }>;
  check: (url: string) => Promise<CheckResult>;
  pair: (input: string) => Promise<PairResult>;
}

export const isLoopback = (host: string): boolean => host === '127.0.0.1' || host === 'localhost' || host.endsWith('.localhost');

const READ_ONLY: PairResult = { ok: false, error: 'Start Nod with nod --local to change the hub.' };

/** The desktop showing the hub: the URL is this page's origin, and the role comes from the hub. */
function hubPageSource(): HubSource {
  const origin = window.location.origin;
  const status = async (): Promise<HubStatus> => {
    try {
      const res = await fetch('/api/devices/me', { cache: 'no-store' });
      return hubStatusFrom(res.status, res.status === 200 ? await res.json() : undefined);
    } catch {
      return { state: 'unreachable' };
    }
  };
  return {
    editable: false,
    url: () => Promise.resolve({ url: origin, attached: true }),
    check: async () => ({ ok: true, url: origin, status: await status() }),
    pair: () => Promise.resolve(READ_ONLY),
  };
}

const FIXTURE_HUB = 'https://hub.example.ts.net';

/** Fixture captures (`?state=hub-*`) in a browser, which has no shell. Shows states only; saves nothing. */
function fixtureSource(state: string): HubSource | undefined {
  const fixed: Record<string, { url: string; attached: boolean; status?: HubStatus }> = {
    'hub-empty': { url: '', attached: false },
    'hub-checking': { url: FIXTURE_HUB, attached: false },
    'hub-admin': { url: FIXTURE_HUB, attached: true, status: { state: 'paired', role: 'admin', version: '0.2.32' } },
    'hub-desktop': { url: FIXTURE_HUB, attached: true, status: { state: 'paired', role: 'desktop', version: '0.2.32' } },
    'hub-unpaired': { url: FIXTURE_HUB, attached: false, status: { state: 'not-paired' } },
    'hub-down': { url: FIXTURE_HUB, attached: false, status: { state: 'unreachable' } },
  };
  const f = fixed[state];
  if (!f) return undefined;
  return {
    editable: !f.attached,
    url: () => Promise.resolve({ url: f.url, attached: f.attached }),
    check: (url) =>
      state === 'hub-checking'
        ? new Promise<CheckResult>(() => undefined)
        : Promise.resolve({ ok: true, url, status: url ? f.status : undefined }),
    pair: () => Promise.resolve({ ok: false, error: 'Fixture mode does not pair.' }),
  };
}

/** The source for this page, or undefined outside the desktop app. */
export function hubSource(): HubSource | undefined {
  const fixture = STATE_PARAM?.startsWith('hub-') ? fixtureSource(STATE_PARAM) : undefined;
  if (fixture) return fixture;
  const bridge = window.nod?.hub;
  if (!window.nod) return undefined;
  if (!isLoopback(window.location.hostname)) return hubPageSource();
  if (!bridge) return undefined;
  return { editable: true, url: bridge.get, check: bridge.check, pair: bridge.pair };
}
