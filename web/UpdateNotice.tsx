import { useEffect, useRef, useState } from 'react';
import { shellNotice, type OpenRef } from '../shared/build-update';
import { CLIENT_BUILD, createUpdateWatcher, hasUnsentDraft, parseSignal, type UpdateNotice } from './build-updates';
import { onLiveEvent } from './live-events';
import { InfoIcon } from './ui';

/** Watches `/api/events` for a new build or an "Update phones" press and reloads onto it. */
export function useBuildUpdates(currentOpen: () => OpenRef | undefined) {
  const [notice, setNotice] = useState<UpdateNotice>();
  const openRef = useRef(currentOpen);
  openRef.current = currentOpen;
  const watcher = useRef<ReturnType<typeof createUpdateWatcher>>(undefined);
  watcher.current ??= createUpdateWatcher({
    client: CLIENT_BUILD,
    session: window.sessionStorage,
    hasDraft: () => hasUnsentDraft(),
    currentOpen: () => openRef.current(),
    location: () => window.location,
    navigate: (url) => window.location.replace(url),
    show: setNotice,
    later: (fn, ms) => void setTimeout(fn, ms),
  });

  useEffect(() => {
    const offs = (['build', 'reload'] as const).map((kind) =>
      onLiveEvent(kind, (data) => {
        const signal = parseSignal(kind, data);
        if (signal) watcher.current?.onSignal(signal);
      }),
    );
    return () => offs.forEach((off) => off());
  }, []);

  return { notice, reloadNow: () => watcher.current?.reloadNow() };
}

type ShellState = ReturnType<typeof shellNotice>;

/** Asks the Electron shell for its build once, so a window left behind by a service update can offer a relaunch. */
export function useShellUpdate(): { notice: ShellState; dismiss: () => void } {
  const [notice, setNotice] = useState<ShellState>('none');
  useEffect(() => {
    const bridge = window.nod;
    if (!bridge) return;
    if (!bridge.shellBuild) {
      setNotice(shellNotice(CLIENT_BUILD, undefined));
      return;
    }
    bridge.shellBuild().then(
      (shell) => setNotice(shellNotice(CLIENT_BUILD, shell)),
      () => undefined,
    );
  }, []);
  return { notice, dismiss: () => setNotice('none') };
}

/** "Nod updated in the background" with Relaunch, or how to restart a shell too old to relaunch itself. */
export function ShellToast({ notice, onDismiss }: { notice: ShellState; onDismiss: () => void }) {
  if (notice === 'none') return null;
  const relaunch = window.nod?.relaunch;
  const text =
    notice === 'relaunch' && relaunch
      ? 'Nod updated in the background.'
      : 'Nod updated. Quit with Ctrl+Q and reopen to finish.';
  return (
    <div className="toast toast-action update-toast" role="status">
      <span className="toast-icon toast-icon-neutral">
        <InfoIcon size={16} />
      </span>
      <span>{text}</span>
      {notice === 'relaunch' && relaunch ? (
        <button type="button" className="btn" onClick={() => void relaunch()}>
          Relaunch
        </button>
      ) : null}
      <button type="button" className="btn" onClick={onDismiss}>
        Later
      </button>
    </div>
  );
}

interface UpdateToastProps {
  notice: UpdateNotice | undefined;
  phone: boolean;
  onReload: () => void;
}

/** "Nod updated" before a reload, or a tap target when a draft holds the reload back. */
export function UpdateToast({ notice, phone, onReload }: UpdateToastProps) {
  if (!notice) return null;
  const text = notice === 'updated' ? 'Nod updated' : 'Update ready, tap to reload';
  if (phone) {
    return notice === 'ready' ? (
      <button type="button" className="ph-toast ph-update-toast" onClick={onReload}>
        {text}
      </button>
    ) : (
      <div className="ph-toast ph-update-toast" role="status">
        {text}
      </div>
    );
  }
  return (
    <div className="toast toast-action update-toast" role="status">
      <span className="toast-icon toast-icon-neutral">
        <InfoIcon size={16} />
      </span>
      <span>{text}</span>
      {notice === 'ready' ? (
        <button type="button" className="btn" onClick={onReload}>
          Reload
        </button>
      ) : null}
    </div>
  );
}
