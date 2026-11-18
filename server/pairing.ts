import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeviceRole, type DeviceRole } from '../shared/pairing';
import { stateDir } from './app-paths';
import { tokensMatch } from './security';

export const CODE_TTL_MS = 10 * 60_000;
export const EXCHANGE_LIMIT = 5;
export const EXCHANGE_WINDOW_MS = 60_000;

/** What is kept of a pending code. Only its hash, so the file cannot pair anything. */
interface Pending {
  hash: string;
  expiresAt: number;
  role: DeviceRole;
}

export function defaultPairingPath(): string {
  return join(stateDir(), 'pairing.json');
}

const hashOf = (code: string): string => createHash('sha256').update(code).digest('hex');

function parsePending(raw: unknown, now: number): Pending | undefined {
  const list = typeof raw === 'object' && raw !== null ? (raw as { pending?: unknown }).pending : undefined;
  const first: unknown = Array.isArray(list) ? list[0] : undefined;
  if (typeof first !== 'object' || first === null) return undefined;
  const { hash, expiresAt, role } = first as Record<string, unknown>;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return undefined;
  if (typeof expiresAt !== 'number' || expiresAt <= now || !isDeviceRole(role)) return undefined;
  return { hash, expiresAt, role };
}

/**
 * The one active pairing code and the exchange rate limit. A new code replaces
 * the old one. The limit counts every exchange try, right or wrong, because all
 * phones reach the server through the same Tailscale Serve proxy. The code
 * carries the role the paired device gets. With a path, the pending code
 * survives a restart, such as the service updating itself.
 */
export class PairingCodes {
  private active: Pending | undefined;
  private tries: number[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly path: string | null = null,
  ) {}

  /** Loads the pending code from `path`. An expired or damaged one is dropped. */
  static async open(path: string = defaultPairingPath(), now: () => number = Date.now): Promise<PairingCodes> {
    const codes = new PairingCodes(now, path);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      raw = undefined;
    }
    codes.active = parsePending(raw, now());
    if (raw !== undefined && !codes.active) codes.save();
    await codes.flush();
    return codes;
  }

  create(role: DeviceRole = 'phone'): { code: string; expiresAt: number; role: DeviceRole } {
    const code = randomBytes(16).toString('base64url');
    const expiresAt = this.now() + CODE_TTL_MS;
    this.active = { hash: hashOf(code), expiresAt, role };
    this.save();
    return { code, expiresAt, role };
  }

  /** Records a try and says whether it is within the limit. */
  allow(): boolean {
    const t = this.now();
    this.tries = this.tries.filter((at) => t - at < EXCHANGE_WINDOW_MS);
    if (this.tries.length >= EXCHANGE_LIMIT) return false;
    this.tries.push(t);
    return true;
  }

  /** True once per code, and only before it expires. */
  consume(code: string): boolean {
    return this.take(code) !== undefined;
  }

  /** The code's role, once per code and only before it expires. */
  take(code: string): DeviceRole | undefined {
    const a = this.active;
    if (!a) return undefined;
    if (this.now() >= a.expiresAt) {
      this.active = undefined;
      this.save();
      return undefined;
    }
    if (!tokensMatch(hashOf(code), a.hash)) return undefined;
    this.active = undefined;
    this.save();
    return a.role;
  }

  /** Resolves once the latest change is on disk. */
  flush(): Promise<void> {
    return this.writing;
  }

  private save(): void {
    this.writing = this.writing.catch(() => undefined).then(() => this.persist());
  }

  private async persist(): Promise<void> {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify({ pending: this.active ? [this.active] : [] }), { mode: 0o600 });
    await rename(tmp, this.path);
  }
}
