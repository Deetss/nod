import { TEST_NOTIFICATION, type NotifyTargetResult, type NotifyTestResult } from '../shared/notify-test';
import type { DeviceStore } from './devices';
import { consoleNotifyLog, pushItem, type NotifyLog, type PushSender } from './push';

/** Pushes the test notification to every subscribed phone and names each result. */
export async function sendTestPush(
  devices: Pick<DeviceStore, 'list' | 'pushTargets' | 'dropPushEndpoint'>,
  send: PushSender | undefined,
  log: NotifyLog = consoleNotifyLog,
): Promise<NotifyTestResult> {
  if (!send) return { push: false, phones: [] };
  const names = new Map(devices.list().map((d) => [d.id, d.name]));
  const outcomes = await pushItem(devices, send, TEST_NOTIFICATION, log);
  const phones = outcomes.map((o): NotifyTargetResult => {
    const target = names.get(o.device) ?? o.device;
    if (o.ok) return { target, ok: true };
    const why = o.status ? `HTTP ${o.status}` : 'no response';
    return { target, ok: false, detail: o.dropped ? `${why}, subscription removed` : why };
  });
  return { push: true, phones };
}
