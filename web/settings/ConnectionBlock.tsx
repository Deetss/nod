import { useEffect, useRef, type ReactNode } from 'react';
import {
  envTokenLine,
  fixCommand,
  MARK_LABELS,
  PILLS,
  SCOPES,
  scopeMark,
  whoLine,
  type Connection,
  type ConnectionState,
  type ScopeMark,
} from '../../shared/connection';
import { CopyCommandButton } from '../copy-link';
import { AlertIcon, CheckIcon, KeyCap } from '../ui';
import type { ConnectionView } from './useConnection';

const INSTALL_LINE = 'Install gh from cli.github.com if it is missing, then log in with the scopes Nod uses.';
const APPROVE_HINT = 'gh opens github.com in your browser to approve. No restart needed.';

export function ConnectionPill({ state }: { state: ConnectionState }) {
  const { label, tone } = PILLS[state];
  return (
    <span className={`conn-pill is-${tone}`}>
      {tone === 'danger' ? <AlertIcon size={12} /> : tone === 'success' ? <CheckIcon size={12} /> : null}
      {label}
    </span>
  );
}

/** Fill, ring and dashed ring tell the marks apart without colour. */
export function ScopeMarkIcon({ mark, size }: { mark: ScopeMark; size: number }) {
  const ring = mark === 'missing-optional' || mark === 'unknown';
  return (
    <span className={`conn-mark is-${mark}`} style={{ width: size, height: size }} role="img" aria-label={MARK_LABELS[mark]}>
      {mark === 'unknown' ? (
        <span className="conn-mark-q" aria-hidden="true">
          ?
        </span>
      ) : (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {mark === 'granted' ? (
            <path d="M4.5 8.3l2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path
              d={ring ? 'M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8' : 'M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4'}
              stroke="currentColor"
              strokeWidth={ring ? 1.5 : 1.8}
              strokeLinecap="round"
            />
          )}
        </svg>
      )}
    </span>
  );
}

function ScopeRows({ c, phone }: { c: Connection; phone: boolean }) {
  return (
    <ul className="conn-scopes" aria-label="Token scopes">
      {SCOPES.map((s) => {
        const mark = scopeMark(c, s);
        return (
          <li key={s.name} className="conn-scope">
            <ScopeMarkIcon mark={mark} size={phone ? 18 : 16} />
            <code className="conn-scope-name">{s.name}</code>
            <span className="conn-need">{s.need}</span>
            <span className={`conn-turns${mark === 'granted' ? ' is-on' : ''}`}>{s.turnsOn}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface ConnectionBlockProps {
  view: ConnectionView;
  /** The phone sheet body: rows wrap, and the pill and buttons live in the sheet. */
  phone?: boolean;
  /** Where no copy context exists (the phone), the copy result. */
  onCopied?: (ok: boolean) => void;
  /** Focus Check again on mount. */
  autoFocus?: boolean;
}

/** Settings > GitHub's Connection card, and the body of the phone's GitHub connection sheet. */
export function ConnectionBlock({ view, phone = false, onCopied, autoFocus }: ConnectionBlockProps) {
  const c = view.connection;
  const card = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (autoFocus) button.current?.focus();
  }, [autoFocus]);

  // After a check the card's bottom edge scrolls into view and focus returns to the button. The phone
  // sheet keeps its scroll, so the result box under the scopes stays in view.
  useEffect(() => {
    if (wasBusy.current && !view.busy && !phone) {
      card.current?.scrollIntoView({ block: 'nearest' });
      button.current?.focus();
    }
    wasBusy.current = view.busy;
  }, [view.busy, phone]);

  // `R` runs Check again while Settings is open, unless a text field has focus.
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!view.busy) void view.check();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phone, view]);

  if (!c) return null;
  const command = fixCommand(c);
  const envLine = envTokenLine(c);
  const result = view.result;

  let message: ReactNode = null;
  if (result?.tone === 'danger') {
    message = (
      <div className="conn-result" role="status">
        <AlertIcon size={16} />
        <span>{result.text}</span>
      </div>
    );
  } else if (result?.tone === 'ok') {
    message = (
      <p className="conn-ok" role="status">
        <CheckIcon size={16} />
        <span>{result.text}</span>
      </p>
    );
  }

  return (
    <section ref={card} className={`conn-card${phone ? ' is-phone' : ''}`} aria-label="Connection">
      {phone ? null : (
        <div className="conn-head">
          <h4 className="conn-title">Connection</h4>
          <ConnectionPill state={c.state} />
        </div>
      )}
      <p className="conn-who" title={whoLine(c)}>
        {whoLine(c)}
      </p>
      {phone ? null : (
        <div className="conn-cols" aria-hidden="true">
          <span>Scope</span>
          <span>Need</span>
          <span>Turns on</span>
        </div>
      )}
      <ScopeRows c={c} phone={phone} />
      <div className="conn-after">
        {message}
        {c.state === 'none' ? <p className="conn-install">{INSTALL_LINE}</p> : null}
        {command ? (
          <>
            <div className="conn-cmd-row">
              <span className="conn-cmd-label">{phone ? 'Run on the computer running Nod' : 'Run in a terminal on this computer'}</span>
              <CopyCommandButton text={command} onResult={onCopied} className={phone ? 'ph-btn' : 'btn'} />
            </div>
            <pre className="conn-cmd">{command}</pre>
            <p className="conn-hint">{APPROVE_HINT}</p>
          </>
        ) : envLine ? (
          <p className="conn-hint">{envLine}</p>
        ) : null}
        {phone ? (
          <p className="conn-hint">Last checked {c.checkedAt}</p>
        ) : (
          <div className="conn-foot">
            <button
              ref={button}
              type="button"
              className={`btn${c.state === 'ok' ? '' : ' btn-primary'}${view.busy ? ' is-busy' : ''}`}
              title="Check again (R)"
              aria-busy={view.busy || undefined}
              aria-disabled={view.busy || undefined}
              onClick={() => {
                if (!view.busy) void view.check();
              }}
            >
              {view.busy ? <span className="spinner" aria-hidden="true" /> : null}
              Check again
              <KeyCap>R</KeyCap>
            </button>
            <span className="conn-checked">Last checked {c.checkedAt}</span>
          </div>
        )}
      </div>
    </section>
  );
}
