import type { NotifyItem } from './notify-rules';

/** What "Send test notification" shows on every phone and the desktop. Tapping it opens Nod. */
export const TEST_NOTIFICATION: NotifyItem = { title: 'Nod test', body: 'Notifications are working.', kind: 'test' };

/** One target's result. `detail` is an HTTP status or a short reason, never an endpoint. */
export interface NotifyTargetResult {
  target: string;
  ok: boolean;
  detail?: string;
}

/** The `/api/notifications/test` answer. */
export interface NotifyTestResult {
  /** False when phone access, and so push, is off. */
  push: boolean;
  phones: NotifyTargetResult[];
}

/** One line per target, for example `Pixel: sent` or `Pixel: failed (HTTP 410, removed)`. */
export function notifyTestLines(phones: NotifyTestResult | undefined, desktop: NotifyTargetResult | undefined): string[] {
  const lines = [desktop, ...(phones?.phones ?? [])]
    .filter((r): r is NotifyTargetResult => r !== undefined)
    .map((r) => `${r.target}: ${r.ok ? 'sent' : `failed${r.detail ? ` (${r.detail})` : ''}`}`);
  if (phones && !phones.push) lines.push('Phones: push is off (phone access is off)');
  else if (phones && phones.phones.length === 0) lines.push('Phones: none subscribed');
  return lines;
}
