import { PHONE_PORT, phoneHttpsPort, phoneOrigin, type PhoneAccess } from './security';

const PROBE_TIMEOUT_MS = 1000;

/** The origin of a Nod already running on `port`, or undefined. */
export async function findRunningService(port: number = PHONE_PORT): Promise<string | undefined> {
  const origin = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { app?: unknown };
    return body.app === 'nod' ? origin : undefined;
  } catch {
    return undefined;
  }
}

const REPROBE_ATTEMPTS = 10;
const REPROBE_DELAY_MS = 300;

/**
 * Uses a running service when there is one, and starts a server only when there is not.
 * Losing the port to a service that is still booting is not a failure, so it re-probes
 * and attaches once that service answers.
 */
export async function attachOrStart(
  start: () => Promise<string>,
  port: number = PHONE_PORT,
): Promise<{ origin: string; attached: boolean }> {
  const running = await findRunningService(port);
  if (running) return { origin: running, attached: true };
  try {
    return { origin: await start(), attached: false };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    for (let i = 0; i < REPROBE_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, REPROBE_DELAY_MS));
      const origin = await findRunningService(port);
      if (origin) return { origin, attached: true };
    }
    throw e;
  }
}

interface StartupInfo {
  /** Where the server listens, for example `http://127.0.0.1:4477`. */
  bound: string;
  phone: PhoneAccess | undefined;
  deviceCount: number;
  /** The advertised HTTPS port, `NOD_PHONE_HTTPS_PORT` by default. */
  httpsPort?: number;
}

/** The lines `nod serve` prints once it is listening. */
export function startupLines({ bound, phone, deviceCount, httpsPort = phoneHttpsPort() }: StartupInfo): string[] {
  const lines = [`Nod service listening on ${bound}`];
  if (!phone) {
    lines.push('Advertised address: none (tailscale is unavailable, so phone access is off)');
    lines.push('Pairing: off');
    return lines;
  }
  lines.push(`Advertised address: ${phoneOrigin(phone.host, httpsPort)}`);
  lines.push(`Tailscale Serve, run once: tailscale serve --bg --https=${httpsPort} ${bound}`);
  const paired = deviceCount === 1 ? '1 phone paired' : `${deviceCount} phones paired`;
  lines.push(`Pairing: ready, ${paired}. Settings > Pair phone in the desktop app shows a new code.`);
  return lines;
}
