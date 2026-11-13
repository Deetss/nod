import { sendNotification } from 'web-push';
import {
  collapseNotifications,
  collectNotifications,
  DEFAULT_SETTINGS,
  isTriggerKey,
  notifyLabel,
  type NotifyItem,
} from '../shared/notify-rules';
import type { IssueInboxData } from '../shared/issue-types';
import { pushPayload, type PushPayload, type PushSubscriptionJson } from '../shared/push';
import type { InboxData } from '../shared/types';
import type { DeviceStore, PushTarget } from './devices';
import type { Provider } from './provider';
import type { VapidKeys } from './vapid';

/** Sends one encrypted payload. Rejects with a `statusCode` when the push service refuses it. */
export type PushSender = (sub: PushSubscriptionJson, payload: PushPayload) => Promise<void>;

/**
 * Where notification lines go. Lines name the kind, the target and device ids only, never an
 * endpoint, a key or the notification text.
 */
export interface NotifyLog {
  info(line: string): void;
  warn(line: string): void;
}

export const consoleNotifyLog: NotifyLog = {
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
};

/** `contact` is the VAPID subject push services may use to reach the operator (settings `push.contact`). */
export function webPushSender(keys: VapidKeys, contact: string): PushSender {
  const details = { subject: contact, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return async (sub, payload) => {
    await sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: details,
      TTL: 3600,
      urgency: 'normal',
    });
  };
}

/** One phone's result for one payload. `status` is the push service's HTTP status on a refusal. */
export interface PushOutcome {
  device: string;
  ok: boolean;
  status?: number;
  /** The push service said the subscription is gone, so it was deleted. */
  dropped?: boolean;
}

/** `1 of 2 phones`, for the info line. */
export function phonesText(outcomes: readonly PushOutcome[]): string {
  const ok = outcomes.filter((o) => o.ok).length;
  return `${ok} of ${outcomes.length} phone${outcomes.length === 1 ? '' : 's'}`;
}

/**
 * Watches the provider's syncs and pushes what the notification rules produce to every
 * subscribed phone. The first snapshot is the baseline, so starting never notifies.
 */
export class PushNotifier {
  private prev: InboxData | undefined;
  private prevIssues: IssueInboxData | undefined;
  private busy = false;
  private again = false;

  constructor(
    private readonly provider: Provider,
    private readonly devices: DeviceStore,
    private readonly send: PushSender,
    private readonly log: NotifyLog = consoleNotifyLog,
  ) {}

  start(): () => void {
    return this.provider.subscribe(() => void this.onSync());
  }

  /** Syncs that land while one is being handled collapse into one more pass. */
  async onSync(): Promise<void> {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        await this.pass();
      } while (this.again);
    } catch (e) {
      this.log.warn(`[notify] push pass failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      this.busy = false;
    }
  }

  private async pass(): Promise<void> {
    const next = await this.provider.inbox(undefined, 'none');
    const nextIssues = await this.provider.issues(undefined);
    const { prev, prevIssues } = this;
    this.prev = next;
    this.prevIssues = nextIssues;
    const items = collectNotifications({
      prev,
      next,
      prevIssues,
      nextIssues,
      settings: DEFAULT_SETTINGS,
      windowFocused: false,
    });
    await pushPolled(this.devices, this.send, items, this.log);
  }

  /** Sends one item to every phone, whatever its switches say. */
  deliver(item: NotifyItem): Promise<PushOutcome[]> {
    return pushItem(this.devices, this.send, item, this.log);
  }
}

/**
 * Sends one poll's items to each phone, minus the types that phone turned off, collapsing
 * per phone. Phones with the same switches share each send and its info line.
 */
export async function pushPolled(
  devices: Pick<DeviceStore, 'pushTargets' | 'dropPushEndpoint'>,
  send: PushSender,
  items: readonly NotifyItem[],
  log: NotifyLog = consoleNotifyLog,
): Promise<void> {
  if (items.length === 0) return;
  const groups = new Map<string, { targets: PushTarget[]; items: NotifyItem[] }>();
  for (const t of devices.pushTargets()) {
    const off = new Set(items.flatMap((i) => (isTriggerKey(i.kind) && !t.switches[i.kind] ? [i.kind] : [])));
    for (const kind of off) log.info(`[notify] skipped ${kind} for ${t.name} (off)`);
    const shown = collapseNotifications(items.filter((i) => !isTriggerKey(i.kind) || !off.has(i.kind)));
    if (shown.length === 0) continue;
    const key = [...off].sort().join(',');
    const group = groups.get(key) ?? { targets: [], items: shown };
    group.targets.push(t);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    for (const item of group.items) {
      const outcomes = await deliverPush(devices, send, group.targets, pushPayload(item), log);
      log.info(`[notify] ${notifyLabel(item)} -> ${phonesText(outcomes)}`);
    }
  }
}

/** Sends one item to every subscribed phone and logs one info line for it. */
export async function pushItem(
  devices: Pick<DeviceStore, 'pushTargets' | 'dropPushEndpoint'>,
  send: PushSender,
  item: NotifyItem,
  log: NotifyLog = consoleNotifyLog,
): Promise<PushOutcome[]> {
  const outcomes = await deliverPush(devices, send, devices.pushTargets(), pushPayload(item), log);
  log.info(`[notify] ${notifyLabel(item)} -> ${phonesText(outcomes)}`);
  return outcomes;
}

/**
 * Sends one payload to each target and drops the subscriptions the push service reports gone.
 * Each failure logs one warn line with the device id and HTTP status.
 */
export async function deliverPush(
  devices: Pick<DeviceStore, 'dropPushEndpoint'>,
  send: PushSender,
  targets: readonly Pick<PushTarget, 'id' | 'push'>[],
  payload: PushPayload,
  log: Pick<NotifyLog, 'warn'> = consoleNotifyLog,
): Promise<PushOutcome[]> {
  const outcomes: PushOutcome[] = [];
  for (const t of targets) {
    try {
      await send(t.push, payload);
      outcomes.push({ device: t.id, ok: true });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const dropped = status === 404 || status === 410;
      if (dropped) await devices.dropPushEndpoint(t.push.endpoint);
      const why = status ? `HTTP ${status}` : 'no response';
      log.warn(`[notify] push to device ${t.id} failed: ${why}${dropped ? ', subscription dropped' : ''}`);
      outcomes.push({ device: t.id, ok: false, ...(status ? { status } : {}), ...(dropped ? { dropped } : {}) });
    }
  }
  return outcomes;
}
