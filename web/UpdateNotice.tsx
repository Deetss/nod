import { useEffect, useRef, useState } from 'react';
import type { OpenRef } from '../shared/build-update';
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
