import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionsBody } from '../../shared/connections';
import { api } from '../api';

/** The server caches its probes for 20 s, so a 30 s poll never queues behind itself. */
const POLL_MS = 30_000;

export interface ConnectionsView {
  /** Undefined until the first answer: the chip and rows show Checking. */
  data: ConnectionsBody | undefined;
  /** Check now is running. The marks keep their last state meanwhile. */
  busy: boolean;
  check: () => Promise<void>;
  reload: () => void;
}

export function useConnections(): ConnectionsView {
  const [data, setData] = useState<ConnectionsBody>();
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  // A failed read keeps the last answer.
  const load = useCallback(async (fresh: boolean) => {
    try {
      const next = await api.connections(fresh);
      if (live.current) setData(next);
    } catch {
      // keep the last state
    }
  }, []);

  useEffect(() => {
    live.current = true;
    void load(false);
    const t = setInterval(() => void load(false), POLL_MS);
    return () => {
      live.current = false;
      clearInterval(t);
    };
  }, [load]);

  const check = useCallback(async () => {
    setBusy(true);
    await load(true);
    if (live.current) setBusy(false);
  }, [load]);

  const reload = useCallback(() => void load(false), [load]);
  return { data, busy, check, reload };
}
