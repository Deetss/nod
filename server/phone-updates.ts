import { randomBytes } from 'node:crypto';
import type { AndroidRelease } from '../shared/android-release';
import type { PhonesUpdateResult, UpdateSignal } from '../shared/build-update';
import type { PushPayload } from '../shared/push';
import type { DeviceStore } from './devices';
import { deliverPush, type NotifyLog, type PushSender } from './push';

/** One open `/api/events` stream. `deviceId` is set for a paired phone and undefined for the desktop. */
export interface LiveClient {
  deviceId: string | undefined;
  send: (signal: UpdateSignal) => unknown;
}

/** The open event streams, so a reload reaches every phone that is listening. */
export class LiveClients {
  private readonly clients = new Set<LiveClient>();

  add(client: LiveClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  /** Sends the signal to every phone stream and returns the ids of the phones it reached. */
  signalPhones(signal: UpdateSignal): Set<string> {
    const reached = new Set<string>();
    for (const c of this.clients) {
      if (c.deviceId === undefined) continue;
      void Promise.resolve(c.send(signal)).catch(() => undefined);
      reached.add(c.deviceId);
    }
    return reached;
  }
}

export const UPDATED_PUSH: PushPayload = { title: 'Nod updated', body: 'Tap to open the new version' };

export function apkPush(release: AndroidRelease): PushPayload {
  return { title: 'App update available', body: `Tap to open Nod and install version ${release.versionName}` };
}

export interface UpdatePhonesInput {
  live: LiveClients;
  devices: Pick<DeviceStore, 'pushTargets' | 'dropPushEndpoint'>;
  /** Undefined when push is off; then only live phones hear about the update. */
  send: PushSender | undefined;
  build: string;
  release: AndroidRelease | undefined;
  log?: Pick<NotifyLog, 'warn'>;
}

/**
 * "Update phones": live phones reload, subscribed phones without a live stream get a push, and
 * any phone whose installed app is older than the published APK gets a push about that instead.
 */
export async function updatePhones(input: UpdatePhonesInput): Promise<PhonesUpdateResult> {
  const { live, devices, send, build, release, log } = input;
  const reached = live.signalPhones({ kind: 'reload', build, nonce: randomBytes(6).toString('hex') });
  const result: PhonesUpdateResult = { reloaded: reached.size, notified: 0, apkNotified: 0 };
  if (!send) return result;

  for (const t of devices.pushTargets()) {
    const behind = release !== undefined && t.apk !== undefined && t.apk < release.versionCode;
    const isLive = reached.has(t.id);
    if (isLive && !behind) continue;
    const payload = behind && release ? apkPush(release) : UPDATED_PUSH;
    const [outcome] = await deliverPush(devices, send, [t], payload, log);
    if (!outcome?.ok) continue;
    if (!isLive) result.notified += 1;
    if (behind) result.apkNotified += 1;
  }
  return result;
}
