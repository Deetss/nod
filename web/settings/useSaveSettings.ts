import { useCallback, useEffect, useState } from 'react';
import type { SettingsSaveResult } from '../../shared/settings-save';
import { api } from '../api';
import { savedMessage } from './form';

export type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; result: SettingsSaveResult; message: string };

/** The app is given this long to come back before the dialog says it did not. */
const WAIT_MS = 30_000;
const POLL_MS = 500;
/** Lets the old process go down before the first probe, so the probe cannot see it. */
const FIRST_PROBE_MS = 1500;

/** Polls until the service answers, then reloads the page onto the new settings. */
function useReloadWhenBack(active: boolean, onTimeout: () => void): void {
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const started = Date.now();
    const probe = () => {
      if (stop) return;
      api.health().then(
        () => window.location.reload(),
        () => {
          if (Date.now() - started > WAIT_MS) onTimeout();
          else setTimeout(probe, POLL_MS);
        },
      );
    };
    const first = setTimeout(probe, FIRST_PROBE_MS);
    return () => {
      stop = true;
      clearTimeout(first);
    };
  }, [active, onTimeout]);
}

/** One save: the request, the server's error or how the service restarts, and the reload when it is back. */
export function useSaveSettings() {
  const [state, setState] = useState<SaveState>({ phase: 'idle' });

  const save = useCallback(async (raw: unknown) => {
    setState({ phase: 'saving' });
    try {
      const result = await api.saveSettings(raw);
      setState({ phase: 'done', result, message: savedMessage(result) });
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : 'Could not save the settings' });
    }
  }, []);

  const timedOut = useCallback(
    () => setState((s) => (s.phase === 'done' ? { ...s, message: 'Nod did not come back. Start it again to apply the settings.' } : s)),
    [],
  );
  useReloadWhenBack(state.phase === 'done' && state.result.mode === 'relaunch', timedOut);

  /** Clears a save error once the user edits again. Does not interrupt a save or a restart. */
  const reset = useCallback(() => setState((s) => (s.phase === 'error' ? { phase: 'idle' } : s)), []);

  return { state, save, reset };
}
