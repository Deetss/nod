import type { NotifyItem, NotifyTarget } from './notify-rules';

/** What a Web Push message carries. Nothing else leaves the server. */
export interface PushPayload {
  title: string;
  body: string;
  target?: NotifyTarget;
}

/** A browser's push subscription, as `PushManager.subscribe` returns it. */
export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The title, body and target of an item, copied field by field. */
export function pushPayload(item: NotifyItem): PushPayload {
  const { title, body, target } = item;
  if (!target) return { title, body };
  return { title, body, target: { kind: target.kind, repo: target.repo, number: target.number } };
}

/** The path a tap on a notification opens. */
export function targetPath(target: NotifyTarget | undefined): string {
  if (!target) return '/';
  return `/?open=${target.kind}/${encodeURIComponent(target.repo)}/${target.number}`;
}
