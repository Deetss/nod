import { useCallback, useEffect, useState } from 'react';
import {
  TRIGGER_DESCRIPTIONS,
  TRIGGER_KEYS,
  TRIGGER_LABELS,
  type TriggerKey,
  type TriggerSwitches,
} from '../../shared/notify-rules';
import { api } from '../api';
import { useFocusTrap } from '../useFocusTrap';
import type { PushState } from './usePush';

/** This phone's switches from the server. Undefined until loaded or when the server refuses. */
export function usePushPrefs(): { prefs: TriggerSwitches | undefined; set: (key: TriggerKey, on: boolean) => void } {
  const [prefs, setPrefs] = useState<TriggerSwitches>();

  useEffect(() => {
    api.pushPrefs().then(setPrefs, (e: unknown) => console.error('[push] prefs', e));
  }, []);

  const set = useCallback((key: TriggerKey, on: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: on } : p));
    api.setPushPrefs({ [key]: on }).then(setPrefs, (e: unknown) => {
      console.error('[push] prefs', e);
      setPrefs((p) => (p ? { ...p, [key]: !on } : p));
    });
  }, []);

  return { prefs, set };
}

interface SwitchRowProps {
  title: string;
  sub: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function SwitchRow(p: SwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={p.on}
      className="ph-arow ph-nrow"
      disabled={p.disabled}
      onClick={p.onToggle}
    >
      <span className="ph-arow-text">
        <span className="ph-arow-title">{p.title}</span>
        <span className="ph-arow-sub">{p.sub}</span>
      </span>
      <span className={`ph-switch${p.on ? ' is-on' : ''}`} aria-hidden="true" />
    </button>
  );
}

interface PhoneNotifySheetProps {
  push: { state: PushState; busy: boolean; toggle: () => Promise<void> };
  onClose: () => void;
}

const MASTER_SUB: Record<PushState, string> = {
  on: 'This phone gets the types switched on below.',
  off: 'This phone gets no notifications.',
  blocked: 'Blocked. Allow notifications for Nod in Android settings.',
  unsupported: 'This browser cannot show notifications.',
};

/** "Notifications on this phone": the master switch, then one switch per notification type. */
export function PhoneNotifySheet(p: PhoneNotifySheetProps) {
  const trap = useFocusTrap(p.onClose);
  const { prefs, set } = usePushPrefs();
  const on = p.push.state === 'on';
  return (
    <div className="ph-scrim" style={{ zIndex: 60 }} onClick={p.onClose}>
      <div
        ref={trap}
        className="ph-asheet"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications on this phone"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="ph-handle" aria-hidden="true" />
        <h2 className="ph-asheet-title">Notifications on this phone</h2>
        <div className="ph-asheet-body">
          <SwitchRow
            title="Notifications"
            sub={MASTER_SUB[p.push.state]}
            on={on}
            disabled={p.push.busy || p.push.state === 'blocked' || p.push.state === 'unsupported'}
            onToggle={() => void p.push.toggle()}
          />
          <h3 className="ph-section-h ph-pad-x">Notify me when</h3>
          {TRIGGER_KEYS.map((key) => (
            <SwitchRow
              key={key}
              title={TRIGGER_LABELS[key]}
              sub={TRIGGER_DESCRIPTIONS[key]}
              on={prefs?.[key] ?? true}
              disabled={!on || !prefs}
              onToggle={() => set(key, !(prefs?.[key] ?? true))}
            />
          ))}
        </div>
        <button type="button" className="ph-btn ph-acancel" onClick={p.onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
