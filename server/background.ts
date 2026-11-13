import type { DeviceStore } from './devices';
import type { Provider } from './provider';
import { PushNotifier, type PushSender } from './push';
import { SyncLoop } from './sync-loop';

export interface BackgroundInput {
  provider: Provider;
  devices: DeviceStore;
  /** Undefined when phone access is off. */
  pushSender: PushSender | undefined;
  fixtures: boolean;
}

export interface Background {
  sync: SyncLoop;
  notifier: PushNotifier | undefined;
}

/**
 * The timers every server needs: the GitHub poll, and phone push when it is on. The
 * notifier subscribes before the first poll, so it sees that poll's change notice.
 */
export function startBackground({ provider, devices, pushSender, fixtures }: BackgroundInput): Background {
  const notifier = pushSender && !fixtures ? new PushNotifier(provider, devices, pushSender) : undefined;
  notifier?.start();
  const sync = new SyncLoop(provider);
  sync.start();
  return { sync, notifier };
}
