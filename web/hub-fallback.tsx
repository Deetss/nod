import { useCallback, useEffect, useState } from 'react';
import { SEEN_SENT_PARAM, type HubBridge } from '../shared/hub';
import { STATE_PARAM } from './api';
import { isLoopback } from './settings/hub-source';
import type { ToastInput } from './toasts';
import { AlertIcon } from './ui';

const POLL_MS = 10_000;
export const RETURN_TOAST_MS = 4000;
const FIXTURE_SENT = 12;

export interface LocalMode {
  /** The hub stopped answering and this window shows this machine's server. */
  down: boolean;
  retrying: boolean;
  retry: () => void;
}

/** Fixture captures (`?state=hub-local`, `hub-local-retrying`) show the banner in a plain browser. */
const fixtureDown = STATE_PARAM === 'hub-local' || STATE_PARAM === 'hub-local-retrying';

/** The shell's hub bridge, only on this machine's own page. The hub's page never asks. */
function localBridge(): HubBridge | undefined {
  return isLoopback(window.location.hostname) ? window.nod?.hub : undefined;
}

/** Whether this desktop is in local mode, read from the shell. Phones and desktops without a Hub URL read false. */
export function useLocalMode(): LocalMode {
  const [down, setDown] = useState(fixtureDown);
  const [retrying, setRetrying] = useState(STATE_PARAM === 'hub-local-retrying');

  useEffect(() => {
    const bridge = fixtureDown ? undefined : localBridge();
    if (!bridge) return;
    let live = true;
    const read = () =>
      bridge.get().then(
        (v) => live && setDown(v.down === true),
        () => undefined,
      );
    void read();
    const t = setInterval(() => void read(), POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const retry = useCallback(() => {
    const bridge = localBridge();
    if (!bridge || retrying) return;
    setRetrying(true);
    // On success the shell moves the window to the hub, so this page may never see the answer.
    bridge
      .retry()
      .then((v) => setDown(v.down === true), () => undefined)
      .finally(() => setRetrying(false));
  }, [retrying]);

  return { down, retrying, retry };
}

/** `?seen-sent=N` on the hub page after local mode: the count, once, then the parameter leaves the URL. */
export function takeSeenSent(url: URL): { count: number; rest: string } | undefined {
  const raw = url.searchParams.get(SEEN_SENT_PARAM);
  if (raw === null || !/^\d{1,6}$/.test(raw)) return undefined;
  url.searchParams.delete(SEEN_SENT_PARAM);
  return { count: Number(raw), rest: `${url.pathname}${url.search}${url.hash}` };
}

export const returnText = (n: number): string => `Back on the hub. ${n} seen ${n === 1 ? 'mark' : 'marks'} sent.`;

/** The reconnect toast. Only the desktop app is sent back with the count, so phones never show it. */
export function useHubReturnToast(push: (t: ToastInput) => void): void {
  useEffect(() => {
    if (STATE_PARAM === 'hub-back') {
      push({ kind: 'ok', message: returnText(FIXTURE_SENT), ms: RETURN_TOAST_MS });
      return;
    }
    if (!window.nod) return;
    const taken = takeSeenSent(new URL(window.location.href));
    if (!taken) return;
    window.history.replaceState(window.history.state, '', taken.rest);
    push({ kind: 'ok', message: returnText(taken.count), ms: RETURN_TOAST_MS });
  }, [push]);
}

interface BannerProps {
  retrying: boolean;
  onRetry: () => void;
}

/** B1: full width under the top bar while the hub is down. */
export function HubDownBanner({ retrying, onRetry }: BannerProps) {
  return (
    <div className="hub-down" role="alert">
      <span className="hub-down-icon">
        <AlertIcon size={16} />
      </span>
      <span className="hub-down-label">Hub unreachable, local mode.</span>
      <span className="hub-down-detail">Seen marks are kept here and sent when the hub is back.</span>
      <button
        type="button"
        className="btn hub-down-retry"
        aria-busy={retrying || undefined}
        aria-disabled={retrying || undefined}
        onClick={() => !retrying && onRetry()}
      >
        {retrying ? <span className="spinner" aria-hidden="true" /> : null}
        Retry
      </button>
    </div>
  );
}
