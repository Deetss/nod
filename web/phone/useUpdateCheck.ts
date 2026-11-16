import { useCallback, useEffect, useRef, useState } from 'react';
import { updateCheckText } from '../../shared/app-update';
import { api } from '../api';
import { TOAST_MS } from './usePhoneWrites';

export interface UpdateToast {
  ok: boolean;
  message: string;
  /** Stays up until the answer replaces it. */
  pending?: boolean;
}

/** The phone menu's Check for updates: asks the host, then says what it found in a toast. */
export function useUpdateCheck(): { toast: UpdateToast | undefined; check: () => void } {
  const [toast, setToast] = useState<UpdateToast>();
  const running = useRef(false);

  useEffect(() => {
    if (!toast || toast.pending) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const check = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setToast({ ok: true, message: 'Checking for updates…', pending: true });
    api
      .checkUpdates()
      .then(
        (r) => setToast({ ok: r.state !== 'failed', message: updateCheckText(r) }),
        (e: unknown) =>
          setToast({ ok: false, message: `Could not check for updates: ${e instanceof Error ? e.message : 'Request failed'}` }),
      )
      .finally(() => {
        running.current = false;
      });
  }, []);

  return { toast, check };
}
