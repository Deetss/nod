import { execFile } from 'node:child_process';
import type { ServeState } from '../shared/connections';
import { DEFAULT_PHONE_HTTPS_PORT } from './security';

/** Serve state is read at most this often, like the Orca session cache. */
export const SERVE_TTL_MS = 20_000;
const EXEC_TIMEOUT_MS = 2000;
const REACH_TIMEOUT_MS = 2000;

const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;

/**
 * Reads `tailscale serve status --json`. This Nod is served when the only handler on the HTTPS
 * site is `/`, proxying to `http://127.0.0.1:<port>`.
 */
export function parseServeStatus(raw: unknown, port: number, httpsPort: number = DEFAULT_PHONE_HTTPS_PORT): ServeState {
  const web = obj(obj(raw)?.Web);
  if (!web) return 'off';
  const sites = Object.entries(web).filter(([name]) => name.endsWith(`:${httpsPort}`));
  if (sites.length === 0) return 'off';
  const target = `http://127.0.0.1:${port}`;
  const ours = sites.some(([, site]) => {
    const handlers = Object.entries(obj(obj(site)?.Handlers) ?? {});
    const only = handlers.length === 1 ? handlers[0] : undefined;
    return only !== undefined && only[0] === '/' && obj(only[1])?.Proxy === target;
  });
  return ours ? 'served' : 'elsewhere';
}

/** Resolves the CLI's stdout. Rejects when tailscale is missing or fails. */
export type ServeExec = () => Promise<string>;
/** True when a request to `url` got an answer from a Nod behind Serve. */
export type ReachProbe = (url: string) => Promise<boolean>;

const execServe: ServeExec = () =>
  new Promise((resolve, reject) => {
    execFile('tailscale', ['serve', 'status', '--json'], { timeout: EXEC_TIMEOUT_MS }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });

// An unpaired caller gets a 401 from the device guard, which still proves the path reaches Nod.
const reachHealth: ReachProbe = async (url) => {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(REACH_TIMEOUT_MS) });
    return res.status < 500;
  } catch {
    return false;
  }
};

export interface ServeProbe {
  serve: ServeState;
  reachable?: boolean;
  at: number;
}

interface TailscaleServeOptions {
  port: number;
  httpsPort?: number;
  exec?: ServeExec;
  reach?: ReachProbe;
  now?: () => number;
}

/** Cached Serve state. Concurrent callers share one run. */
export class TailscaleServe {
  private snap: ServeProbe | undefined;
  private inflight: Promise<ServeProbe> | undefined;
  private readonly exec: ServeExec;
  private readonly reach: ReachProbe;
  private readonly now: () => number;

  constructor(private readonly opts: TailscaleServeOptions) {
    this.exec = opts.exec ?? execServe;
    this.reach = opts.reach ?? reachHealth;
    this.now = opts.now ?? Date.now;
  }

  /** `url` is the advertised phone origin. `fresh` skips the cache, for Check now. */
  async status(url: string, fresh = false): Promise<ServeProbe> {
    const s = this.snap;
    if (!fresh && s && this.now() - s.at < SERVE_TTL_MS) return s;
    this.inflight ??= this.read(url).finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async read(url: string): Promise<ServeProbe> {
    let serve: ServeState = 'off';
    try {
      const parsed = JSON.parse(await this.exec()) as unknown;
      serve = parseServeStatus(parsed, this.opts.port, this.opts.httpsPort);
    } catch {
      serve = 'off';
    }
    const next: ServeProbe =
      serve === 'served' ? { serve, reachable: await this.reach(url), at: this.now() } : { serve, at: this.now() };
    this.snap = next;
    return next;
  }
}
