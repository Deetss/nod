import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null | undefined> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg?.pushManager.getSubscription();
}

async function currentState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return (await currentSubscription()) ? 'on' : 'off';
}

async function sendSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await api.pushSubscribe({
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  });
}

/**
 * Tells the server the subscription this browser holds now. A re-pair, a reinstalled app or a
 * rotated subscription would otherwise leave the server pushing to an endpoint the phone lost.
 */
export async function resyncPush(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await sendSubscription(sub);
}

/** "Notifications on this phone": asks permission, subscribes, and tells the server. */
export function usePush(): { state: PushState; busy: boolean; toggle: () => Promise<void> } {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentState().then(setState, () => setState('unsupported'));
    resyncPush().catch((e: unknown) => console.error('[push] resync', e));
  }, []);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await api.pushUnsubscribe();
        await existing.unsubscribe();
      } else if ((await Notification.requestPermission()) === 'granted') {
        const { publicKey } = await api.pushKey();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        });
        await sendSubscription(sub);
      }
    } catch (e) {
      console.error('[push]', e);
    } finally {
      setState(await currentState().catch(() => 'unsupported' as const));
      setBusy(false);
    }
  }, []);

  return { state, busy, toggle };
}
