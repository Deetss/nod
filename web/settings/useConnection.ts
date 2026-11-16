import { useCallback, useState } from 'react';
import type { CheckResult, Connection } from '../../shared/connection';
import { api } from '../api';

export interface ConnectionView {
  connection: Connection | undefined;
  /** The line Check again left, until the dialog or sheet closes. */
  result: CheckResult | undefined;
  busy: boolean;
  check: () => Promise<void>;
  clearResult: () => void;
}

/**
 * The connection from the lists, overridden by a Check again answer until the lists catch up.
 * `onChecked` reloads them, so the banners follow the new state.
 */
export function useConnection(server: Connection | undefined, onChecked: () => void): ConnectionView {
  const [local, setLocal] = useState<{ connection: Connection; over: Connection | undefined }>();
  const [result, setResult] = useState<CheckResult>();
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.checkConnection();
      setLocal({ connection: res.connection, over: server });
      setResult(res.result);
      onChecked();
    } catch (e) {
      setResult({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not check the token.' });
    } finally {
      setBusy(false);
    }
  }, [server, onChecked]);

  const clearResult = useCallback(() => setResult(undefined), []);
  const connection = local && local.over === server ? local.connection : (server ?? local?.connection);
  return { connection, result, busy, check, clearResult };
}
