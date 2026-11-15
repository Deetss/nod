import { useState } from 'react';
import { updateCheckText, type UpdateCheckResult } from '../../shared/app-update';
import { api } from '../api';
import { Btn } from '../ui';

/** "Check for updates" and the line its answer reads as. */
export function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult>();

  const run = async () => {
    setBusy(true);
    setResult(undefined);
    setResult(
      await api
        .checkUpdates()
        .catch((e: unknown): UpdateCheckResult => ({ state: 'failed', error: e instanceof Error ? e.message : 'request failed' })),
    );
    setBusy(false);
  };

  return (
    <div className="pair-test">
      <Btn disabled={busy} onClick={() => void run()}>
        {busy ? 'Checking...' : 'Check for updates'}
      </Btn>
      {result ? (
        <p className={`small ${result.state === 'failed' ? 'dispatch-error' : 'muted'}`} role="status">
          {updateCheckText(result)}
        </p>
      ) : null}
    </div>
  );
}
