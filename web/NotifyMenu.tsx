import { useEffect, useRef, useState } from 'react';
import { TRIGGER_DESCRIPTIONS, TRIGGER_KEYS, TRIGGER_LABELS, type NotifySettings } from '../shared/notify-rules';
import type { Density } from './density';
import type { OrcaMenu } from './orca/useOrca';
import type { RepoMode } from '../shared/orca-prefs';

interface NotifyMenuProps {
  settings: NotifySettings;
  onChange: (next: NotifySettings) => void;
  density: Density;
  onDensity: (d: Density) => void;
  /** The Orca messages group. Absent when Orca is not reachable. */
  orca?: OrcaMenu | undefined;
}

const REPO_MODES: { value: RepoMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/** The switch for automatic Orca messages and one override per repo. */
function OrcaGroup({ orca }: { orca: OrcaMenu }) {
  return (
    <div className="notify-group orca-group-menu" aria-label="Orca messages" role="group">
      <div className="notify-title">Orca messages</div>
      <label className="notify-row">
        <input type="checkbox" checked={orca.enabled} onChange={(e) => orca.onEnabled(e.target.checked)} />
        <span>Tell Orca sessions about my actions</span>
      </label>
      {orca.repoNames.length > 0 ? <div className="notify-title">Per repo</div> : null}
      {orca.repoNames.map((name) => {
        const mode: RepoMode = orca.repos[name.toLowerCase()] ?? 'default';
        return (
          <div key={name} className="notify-row orca-repo-row">
            <span className="ellipsis orca-repo-name" title={name}>{name}</span>
            <select
              className={`btn orca-select${mode === 'default' ? '' : ' is-set'}`}
              aria-label={`Automatic Orca messages for ${name}`}
              value={mode}
              onChange={(e) => orca.onRepo(name, e.target.value as RepoMode)}
            >
              {REPO_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <p className="muted orca-menu-hint">
        Default follows the box above ({orca.enabled ? 'on' : 'off'}). Covers approve, request changes, comment, merge, ready for review,
        and issue close or reopen. Never sends comment text.
      </p>
    </div>
  );
}

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

/** Bell button with a popover of settings: density everywhere, notification triggers in the desktop app. */
export function NotifyMenu({ settings, onChange, density, onDensity, orca }: NotifyMenuProps) {
  const desktop = Boolean(window.nod);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [testing, setTesting] = useState(false);

  // The test ignores mute, the switches and window focus.
  const sendTest = () => {
    setTesting(true);
    void window.nod
      ?.testNotify()
      .catch(() => undefined)
      .finally(() => setTesting(false));
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="notify-menu" ref={root}>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="Notification settings"
        aria-expanded={open}
        title={settings.muted ? 'Notifications muted' : 'Notification settings'}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2.5a4 4 0 0 0-4 4v2.2L2.8 11h10.4L12 8.7V6.5a4 4 0 0 0-4-4zM6.5 12.8a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {settings.muted ? (
            <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          ) : null}
        </svg>
      </button>
      {open ? (
        <div className="notify-pop" role="dialog" aria-label="Settings">
          <div className="notify-group" role="radiogroup" aria-label="Density">
            <div className="notify-title">Density</div>
            {DENSITY_OPTIONS.map((o) => (
              <label key={o.value} className="notify-row">
                <input
                  type="radio"
                  name="density"
                  checked={density === o.value}
                  onChange={() => onDensity(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          {orca ? <OrcaGroup orca={orca} /> : null}
          {desktop ? (
            <>
              <label className="notify-row notify-mute">
                <input
                  type="checkbox"
                  checked={settings.muted}
                  onChange={(e) => onChange({ ...settings, muted: e.target.checked })}
                />
                <span>Mute all</span>
              </label>
              {TRIGGER_KEYS.map((key) => (
                <label key={key} className="notify-row notify-type">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    disabled={settings.muted}
                    onChange={(e) => onChange({ ...settings, [key]: e.target.checked })}
                  />
                  <span className="notify-type-text">
                    <span>{TRIGGER_LABELS[key]}</span>
                    <span className="muted notify-type-desc">{TRIGGER_DESCRIPTIONS[key]}</span>
                  </span>
                </label>
              ))}
              <div className="notify-test">
                <button type="button" className="btn" disabled={testing} onClick={sendTest}>
                  {testing ? 'Sending...' : 'Send test notification'}
                </button>
                <span className="muted">Always sends, even when muted or switched off.</span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
