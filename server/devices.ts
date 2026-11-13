import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stateDir } from './app-paths';
import type { DeviceInfo } from '../shared/pairing';
import type { PushSubscriptionJson } from '../shared/push';
import { TRIGGER_KEYS, type TriggerSwitches } from '../shared/notify-rules';

/** A last-seen write at most this often, so a busy phone does not rewrite the file per request. */
const TOUCH_INTERVAL_MS = 60_000;
/** A paired phone's cookie is re-sent at most this often. */
const RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NAME_MAX = 60;

interface StoredDevice {
  id: string;
  name: string;
  /** SHA-256 of the device key, hex. The key itself is never stored. */
  hash: string;
  createdAt: string;
  lastSeen: string;
  /** Web Push subscription, present while the phone has notifications on. */
  push?: PushSubscriptionJson;
  /** Version code of the installed Android app, as the app last reported it. */
  apk?: number;
  /** Notification types this phone turned off. A missing type is on. */
  notify?: Partial<TriggerSwitches>;
}

/** A device that can be reached by Web Push. */
export interface PushTarget {
  id: string;
  name: string;
  switches: TriggerSwitches;
  push: PushSubscriptionJson;
  apk: number | undefined;
}

/** A device's switches, with every type it never turned off left on. */
function switchesOf(d: StoredDevice): TriggerSwitches {
  const off = d.notify ?? {};
  return Object.fromEntries(TRIGGER_KEYS.map((k) => [k, off[k] !== false])) as TriggerSwitches;
}

export { stateDir } from './app-paths';

export function defaultDevicesPath(): string {
  return join(stateDir(), 'devices.json');
}

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

function parseStored(raw: unknown): StoredDevice[] {
  const list = (raw as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(list)) return [];
  return list.filter((d): d is StoredDevice => {
    if (typeof d !== 'object' || d === null) return false;
    const r = d as Record<string, unknown>;
    return ['id', 'name', 'hash', 'createdAt', 'lastSeen'].every((k) => typeof r[k] === 'string');
  });
}

/** Display name for a new device, taken from its User-Agent. The user can rename it. */
export function deviceNameFromUserAgent(ua: string | undefined): string {
  if (!ua) return 'Phone';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  const android = /Android[^;)]*;\s*([^;)]+)/.exec(ua)?.[1]?.replace(/\s*Build\/.*$/, '').trim();
  if (android) return android.length > 2 ? android : 'Android phone';
  return 'Phone';
}

/** Paired phones. Holds only key hashes, in memory and (when given a path) in a mode 600 file. */
export class DeviceStore {
  private byHash = new Map<string, StoredDevice>();
  private lastWrite = Promise.resolve();
  private lastTouched = new Map<string, number>();
  private lastRenewed = new Map<string, number>();

  private constructor(private readonly path: string | undefined) {}

  /** A store that never touches disk. */
  static memory(): DeviceStore {
    return new DeviceStore(undefined);
  }

  /** Loads the file at `path`. */
  static async open(path: string = defaultDevicesPath()): Promise<DeviceStore> {
    const store = new DeviceStore(path);
    try {
      for (const d of parseStored(JSON.parse(await readFile(path, 'utf8')) as unknown)) store.byHash.set(d.hash, d);
    } catch {
      // missing or unreadable file: start empty
    }
    return store;
  }

  /** Registers a device and returns its key. This is the only time the key exists outside the phone. */
  async add(name: string): Promise<string> {
    const key = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const hash = hashKey(key);
    const device = {
      id: randomBytes(6).toString('hex'),
      name: name.trim().slice(0, NAME_MAX) || 'Phone',
      hash,
      createdAt: now,
      lastSeen: now,
    };
    this.byHash.set(hash, device);
    await this.save();
    console.error(`[devices] paired ${device.id} (${device.name})`);
    return key;
  }

  /** True when the key belongs to a paired device. Updates the last-seen time. */
  verify(key: string): boolean {
    const hash = hashKey(key);
    const device = this.byHash.get(hash);
    if (!device) return false;
    const nowMs = Date.now();
    if (nowMs - (this.lastTouched.get(hash) ?? 0) >= TOUCH_INTERVAL_MS) {
      this.lastTouched.set(hash, nowMs);
      device.lastSeen = new Date(nowMs).toISOString();
      void this.save().catch((e: unknown) => console.error('[devices] could not save:', e));
    }
    return true;
  }

  /** True at most once per renewal interval for a paired key, so its cookie can be re-sent. */
  shouldRenew(key: string): boolean {
    const hash = hashKey(key);
    if (!this.byHash.has(hash)) return false;
    const nowMs = Date.now();
    if (nowMs - (this.lastRenewed.get(hash) ?? -Infinity) < RENEW_INTERVAL_MS) return false;
    this.lastRenewed.set(hash, nowMs);
    return true;
  }

  /** Stores or clears the push subscription of the device that owns `key`. */
  async setPush(key: string, sub: PushSubscriptionJson | undefined): Promise<boolean> {
    const device = this.byHash.get(hashKey(key));
    if (!device) return false;
    if (sub) device.push = sub;
    else delete device.push;
    await this.save();
    return true;
  }

  /** The id of the device that owns `key`, without touching its last-seen time. */
  idForKey(key: string): string | undefined {
    return this.byHash.get(hashKey(key))?.id;
  }

  /** Records the Android app version the device reports. Writes only when it changed. */
  async setApk(key: string, versionCode: number): Promise<void> {
    const device = this.byHash.get(hashKey(key));
    if (!device || device.apk === versionCode) return;
    device.apk = versionCode;
    await this.save();
  }

  /** The notification switches of the device that owns `key`. */
  notifySwitches(key: string): TriggerSwitches | undefined {
    const device = this.byHash.get(hashKey(key));
    return device ? switchesOf(device) : undefined;
  }

  /** Merges `patch` into the switches of the device that owns `key`. No other device changes. */
  async setNotifySwitches(key: string, patch: Partial<TriggerSwitches>): Promise<TriggerSwitches | undefined> {
    const device = this.byHash.get(hashKey(key));
    if (!device) return undefined;
    const next = { ...switchesOf(device), ...patch };
    const off = TRIGGER_KEYS.filter((k) => !next[k]);
    if (off.length > 0) device.notify = Object.fromEntries(off.map((k) => [k, false]));
    else delete device.notify;
    await this.save();
    return next;
  }

  /** Every device with a push subscription. */
  pushTargets(): PushTarget[] {
    return [...this.byHash.values()].flatMap((d) =>
      d.push ? [{ id: d.id, name: d.name, switches: switchesOf(d), push: d.push, apk: d.apk }] : [],
    );
  }

  /** Every stored push subscription. Revoking a device drops its subscription with it. */
  pushSubscriptions(): PushSubscriptionJson[] {
    return [...this.byHash.values()].flatMap((d) => (d.push ? [d.push] : []));
  }

  /** Drops a subscription the push service reported as gone. */
  async dropPushEndpoint(endpoint: string): Promise<void> {
    let changed = false;
    for (const d of this.byHash.values()) {
      if (d.push?.endpoint === endpoint) {
        delete d.push;
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  list(): DeviceInfo[] {
    return [...this.byHash.values()]
      .map(({ id, name, createdAt, lastSeen }) => ({ id, name, createdAt, lastSeen }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async rename(id: string, name: string): Promise<boolean> {
    const device = [...this.byHash.values()].find((d) => d.id === id);
    const clean = name.trim().slice(0, NAME_MAX);
    if (!device || !clean) return false;
    device.name = clean;
    await this.save();
    return true;
  }

  /** Deleting the hash invalidates the key on its next request. */
  async revoke(id: string): Promise<boolean> {
    const device = [...this.byHash.values()].find((d) => d.id === id);
    if (!device) return false;
    this.byHash.delete(device.hash);
    this.lastTouched.delete(device.hash);
    this.lastRenewed.delete(device.hash);
    await this.save();
    console.error(`[devices] revoked ${device.id}`);
    return true;
  }

  /** Writes atomically with mode 600, one write at a time. */
  private save(): Promise<void> {
    const path = this.path;
    if (!path) return Promise.resolve();
    const body = JSON.stringify({ devices: [...this.byHash.values()] });
    const next = this.lastWrite.then(async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
      await rename(tmp, path);
    });
    this.lastWrite = next.catch(() => undefined);
    return next;
  }
}
