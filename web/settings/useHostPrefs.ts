import { useCallback, useEffect, useState } from 'react';
import { LOCAL_HOST, type HostPrefs, type HostStatus } from '../../shared/orca-hosts';
import type { PrefsPatch } from '../../shared/orca-prefs';
import { api } from '../api';

export interface HostPrefsState {
  /** Undefined until both reads answer. */
  hosts: HostStatus[] | undefined;
  prefs: HostPrefs | undefined;
  /** The key of the select being saved: `default` or a repo. */
  saving: string | undefined;
  error: string | undefined;
  setDefault: (host: string) => void;
  setRepo: (repo: string, host: string) => void;
}

/** True when this Nod has Orca hosts besides its own, so its local host reads `local (hub)`. */
export const hasPairedHosts = (hosts: readonly HostStatus[] | undefined) => (hosts ?? []).some((h) => h.name !== LOCAL_HOST);

/** Reads the Orca hosts and the saved host choices, and saves a change at once. */
export function useHostPrefs(): HostPrefsState {
  const [hosts, setHosts] = useState<HostStatus[] | undefined>();
  const [prefs, setPrefs] = useState<HostPrefs | undefined>();
  const [saving, setSaving] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let live = true;
    Promise.all([api.orcaHosts(), api.orcaHostPrefs()])
      .then(([h, p]) => {
        if (!live) return;
        setHosts(h);
        setPrefs(p);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not read the Orca hosts.');
      });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback((key: string, patch: PrefsPatch, next: (p: HostPrefs) => HostPrefs) => {
    setSaving(key);
    setError(undefined);
    api
      .orcaPrefs(patch)
      .then(() => setPrefs((p) => (p ? next(p) : p)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save.'))
      .finally(() => setSaving(undefined));
  }, []);

  const setDefault = useCallback(
    (host: string) => {
      const value = host === LOCAL_HOST ? null : host;
      save('default', { defaultHost: value }, (p) => ({ ...p, defaultHost: value }));
    },
    [save],
  );

  const setRepo = useCallback(
    (repo: string, host: string) => {
      const value = host === '' ? null : host;
      save(repo, { repo, host: value }, (p) => {
        const { [repo]: _drop, ...rest } = p.hosts;
        return { ...p, hosts: value ? { ...rest, [repo]: value } : rest };
      });
    },
    [save],
  );

  return { hosts, prefs, saving, error, setDefault, setRepo };
}
