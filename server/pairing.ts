import { randomBytes } from 'node:crypto';
import type { DeviceRole } from '../shared/pairing';
import { tokensMatch } from './security';

export const CODE_TTL_MS = 10 * 60_000;
export const EXCHANGE_LIMIT = 5;
export const EXCHANGE_WINDOW_MS = 60_000;

/**
 * The one active pairing code and the exchange rate limit. A new code replaces
 * the old one. The limit counts every exchange try, right or wrong, because all
 * phones reach the server through the same Tailscale Serve proxy. The code
 * carries the role the paired device gets.
 */
export class PairingCodes {
  private active: { code: string; expiresAt: number; role: DeviceRole } | undefined;
  private tries: number[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  create(role: DeviceRole = 'phone'): { code: string; expiresAt: number; role: DeviceRole } {
    this.active = { code: randomBytes(16).toString('base64url'), expiresAt: this.now() + CODE_TTL_MS, role };
    return this.active;
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
      return undefined;
    }
    if (!tokensMatch(code, a.code)) return undefined;
    this.active = undefined;
    return a.role;
  }

}
