import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { phonesUpdateText } from '../shared/build-update';
import type { DeviceInfo, DevicesResponse, PairCode } from '../shared/pairing';
import { api } from './api';
import { qrModules } from './qr';
import { TestNotifications } from './TestNotifications';
import { Btn } from './ui';
import { useFocusTrap } from './useFocusTrap';

const QUIET_ZONE = 4;
const DEVICE_POLL_MS = 3000;

/** Black on white at any theme, with the quiet zone a scanner needs. */
function QrCode({ text }: { text: string }) {
  const rows = useMemo(() => qrModules(text), [text]);
  const n = rows.length + QUIET_ZONE * 2;
  const path = rows
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      className="pair-qr"
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label="Pairing QR code"
      shapeRendering="crispEdges"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}

interface DeviceRowProps {
  device: DeviceInfo;
  onRename: (id: string, name: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}

function DeviceRow({ device, onRename, onRevoke }: DeviceRowProps) {
  const [name, setName] = useState<string | undefined>();
  const save = () => {
    if (name === undefined) return;
    void onRename(device.id, name).then(() => setName(undefined));
  };
  return (
    <li className="pair-device">
      {name === undefined ? (
        <>
          <span className="pair-device-name">
            {device.name}
            <span className="muted small"> last seen {new Date(device.lastSeen).toLocaleString()}</span>
          </span>
          <Btn onClick={() => setName(device.name)}>Rename</Btn>
          <Btn onClick={() => void onRevoke(device.id)}>Revoke</Btn>
        </>
      ) : (
        <>
          <input
            type="text"
            className="pair-device-input"
            value={name}
            maxLength={60}
            aria-label={`Name for ${device.name}`}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setName(undefined);
              }
            }}
          />
          <Btn primary disabled={name.trim() === ''} onClick={save}>
            Save
          </Btn>
          <Btn onClick={() => setName(undefined)}>Cancel</Btn>
        </>
      )}
    </li>
  );
}

/** Reloads the phones onto this build, and pushes to the ones that are not open. */
function UpdatePhones() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const run = () => {
    setBusy(true);
    setResult(undefined);
    api
      .updatePhones()
      .then(
        (r) => setResult({ ok: true, text: phonesUpdateText(r) }),
        (e: unknown) => setResult({ ok: false, text: errorText(e) }),
      )
      .finally(() => setBusy(false));
  };
  return (
    <span className="pair-update">
      {result ? (
        <span className={`small ${result.ok ? 'muted' : 'dispatch-error'}`} role="status">
          {result.text}
        </span>
      ) : null}
      <Btn disabled={busy} onClick={run}>
        {busy ? 'Updating...' : 'Update phones'}
      </Btn>
    </span>
  );
}

/** Top bar phone button: a QR code and link for a one-time code, plus the paired devices. */
export function PairDialog({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<DevicesResponse | undefined>();
  const [code, setCode] = useState<PairCode | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [justPaired, setJustPaired] = useState(false);

  const knownCount = useRef<number | undefined>(undefined);
  const trap = useFocusTrap();

  const refresh = useCallback(async () => {
    try {
      const next = await api.devices();
      // A new device while a code is showing means that code was just used.
      if (knownCount.current !== undefined && next.devices.length > knownCount.current) {
        setCode(undefined);
        setJustPaired(true);
      }
      knownCount.current = next.devices.length;
      setInfo(next);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const newCode = useCallback(async () => {
    setError(undefined);
    setJustPaired(false);
    try {
      setCode(await api.pairCode());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), DEVICE_POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const phoneOn = info?.phoneUrl !== undefined;
  useEffect(() => {
    if (phoneOn) void newCode();
  }, [phoneOn, newCode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remaining = code ? Date.parse(code.expiresAt) - now : 0;
  const live = code !== undefined && remaining > 0;

  const copy = () => {
    if (!code) return;
    void navigator.clipboard.writeText(code.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const run = (action: () => Promise<unknown>) =>
    action().then(refresh, (e: unknown) => setError(errorText(e)));

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        ref={trap}
        className="dialog pair-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Pair phone"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>Pair phone</h2>
          <Btn onClick={onClose}>Close</Btn>
        </div>
        {info && !phoneOn ? (
          <p>
            Phone access is off. Turn on Settings &gt; Phone access in the desktop app and restart, or run
            <span className="mono"> nod serve</span>.
          </p>
        ) : null}
        {phoneOn && live && code ? (
          <div className="pair-code">
            <QrCode text={code.link} />
            <p className="muted small">
              Scan with the phone camera. The code works once and expires in{' '}
              <strong>{countdown(remaining)}</strong>.
            </p>
            <div className="pair-link">
              <input type="text" readOnly className="mono" value={code.link} aria-label="Pairing link" />
              <Btn onClick={copy}>{copied ? 'Copied' : 'Copy'}</Btn>
            </div>
          </div>
        ) : null}
        {phoneOn && !live ? (
          <div className="pair-code">
            <p>{justPaired ? 'Phone paired.' : code ? 'The code expired.' : 'Making a code...'}</p>
            <Btn primary onClick={() => void newCode()}>
              {justPaired ? 'Pair another phone' : 'New code'}
            </Btn>
          </div>
        ) : null}
        {error ? (
          <p className="dispatch-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="pair-devices-head">
          <div className="notify-title">Paired phones</div>
          {phoneOn ? <UpdatePhones /> : null}
        </div>
        {info && info.devices.length > 0 ? (
          <ul className="pair-devices">
            {info.devices.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                onRename={(id, name) => run(() => api.renameDevice(id, name))}
                onRevoke={(id) => run(() => api.revokeDevice(id))}
              />
            ))}
          </ul>
        ) : (
          <p className="muted">{info ? 'No phones paired yet.' : 'Loading...'}</p>
        )}
        <TestNotifications />
      </div>
    </div>
  );
}
