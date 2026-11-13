import { useState } from 'react';
import { notifyTestLines, type NotifyTargetResult, type NotifyTestResult } from '../shared/notify-test';
import { api } from './api';
import { Btn } from './ui';

interface Outcome {
  lines: string[];
  ok: boolean;
}

function failed(target: string, e: unknown): NotifyTargetResult {
  return { target, ok: false, detail: e instanceof Error ? e.message : 'request failed' };
}

/** Sends one test to every subscribed phone and to this desktop, then lists each result. */
export function TestNotifications() {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();

  const run = async () => {
    setBusy(true);
    setOutcome(undefined);
    const [phones, desktop] = await Promise.all([
      api.testNotifications().catch((e: unknown): NotifyTestResult => ({ push: true, phones: [failed('Phones', e)] })),
      window.nod?.testNotify().catch((e: unknown) => failed('Desktop', e)),
    ]);
    const all = [desktop, ...phones.phones].filter((r) => r !== undefined);
    setOutcome({ lines: notifyTestLines(phones, desktop), ok: all.length > 0 && all.every((r) => r.ok) });
    setBusy(false);
  };

  return (
    <div className="pair-test">
      <Btn disabled={busy} onClick={() => void run()}>
        {busy ? 'Sending...' : 'Send test notification'}
      </Btn>
      {outcome ? (
        <ul className={`small ${outcome.ok ? 'muted' : 'dispatch-error'}`} role="status">
          {outcome.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
