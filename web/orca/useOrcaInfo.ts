import { useEffect } from 'react';
import type { OrcaInfo } from '../../shared/orca';
import { api } from '../api';
import { useRemote, type Remote } from '../useRemote';

/**
 * Whether Orca runs and which repos it has. Read again whenever the window comes back, so a
 * reading taken while Orca was down does not hide Dispatch until the page reloads.
 */
export function useOrcaInfo(): Remote<OrcaInfo> {
  const remote = useRemote('orca', () => api.orca());
  const { reload } = remote;

  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [reload]);

  return remote;
}
