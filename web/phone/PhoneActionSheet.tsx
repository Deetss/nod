import { useEffect, useRef, useState } from 'react';
import type { ConfirmKind } from './sheet-stack';
import type { ActionItem } from './action-items';
import { ChevronIcon } from './PhoneIcons';
import { CheckIcon } from '../ui';
import { bot } from '../org-settings';
import { useFocusTrap } from '../useFocusTrap';
import { useKeyboardInset } from './useKeyboardInset';
import { repoLabel } from '../repo-label';

interface ActionSheetProps {
  title: string;
  items: ActionItem[];
  onRun: (item: ActionItem) => void;
  onClose: () => void;
}

const CLOSE_IDS = new Set(['close-completed', 'close-not-planned']);
const BOT_IDS = new Set(['bot-check', 'bot-trim']);

/** Bottom sheet of actions. Tap the scrim, Cancel or Back to close. */
export function PhoneActionSheet(p: ActionSheetProps) {
  const primary = p.items.find((i) => i.id === 'start-work' || i.id === 'stop-work' || i.id === 'reopen');
  const rest = p.items.filter((i) => i !== primary && !BOT_IDS.has(i.id));
  const trim = p.items.find((i) => i.id === 'bot-trim');
  const check = p.items.find((i) => i.id === 'bot-check');
  const statuses = rest.filter((i) => i.id.startsWith('status:'));
  const rows = rest.filter((i) => !CLOSE_IDS.has(i.id) && !i.id.startsWith('status:'));
  const closes = rest.filter((i) => CLOSE_IDS.has(i.id));
  const row = (i: ActionItem) => (
    <button
      key={i.id}
      type="button"
      className={`ph-arow${i.dashed ? ' is-dashed' : ''}${i.emphasis ? ` is-${i.emphasis}` : ''}`}
      disabled={!!i.disabled}
      aria-description={i.disabled ?? i.sub}
      onClick={() => p.onRun(i)}
    >
      <span className="ph-arow-text">
        <span className="ph-arow-title">{i.label}</span>
        {i.disabled || i.sub ? <span className="ph-arow-sub">{i.disabled ?? i.sub}</span> : null}
      </span>
      {i.confirm || i.opens || i.id === 'comment' ? <ChevronIcon open={false} /> : null}
    </button>
  );

  const trap = useFocusTrap(p.onClose);

  return (
    <div className="ph-scrim" style={{ zIndex: 60 }} onClick={p.onClose}>
      <div ref={trap} className="ph-asheet" role="dialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <span className="ph-handle" aria-hidden="true" />
        <h2 className="ph-asheet-title">{p.title}</h2>
        <div className="ph-asheet-body">
        {trim || check ? (
          <div className="ph-bot-top">
            {trim ? (
              <button type="button" className="ph-btn is-primary ph-aprimary" disabled={!!trim.disabled} onClick={() => p.onRun(trim)}>
                {trim.label}
              </button>
            ) : null}
            {check ? (
              <button
                type="button"
                className={`ph-btn ph-bot-check${trim ? '' : ' is-wide'}`}
                disabled={!!check.disabled}
                aria-description={check.disabled ?? check.sub}
                onClick={() => p.onRun(check)}
              >
                {check.label}
              </button>
            ) : null}
          </div>
        ) : null}
        {primary ? (
          <button
            type="button"
            className="ph-btn is-primary ph-aprimary"
            disabled={!!primary.disabled}
            onClick={() => p.onRun(primary)}
          >
            {primary.label}
          </button>
        ) : null}
        {rows.map(row)}
        {closes.length ? (
          <>
            <h3 className="ph-section-h ph-pad-x">Close issue</h3>
            <div className="ph-seg" role="group" aria-label="Close issue">
            {closes.map((i) => (
              <button
                key={i.id}
                type="button"
                className={i.emphasis ? `is-${i.emphasis}` : undefined}
                disabled={!!i.disabled}
                onClick={() => p.onRun(i)}
              >
                {i.label}
              </button>
            ))}
            </div>
          </>
        ) : null}
        {statuses.length ? (
          <>
            <h3 className="ph-section-h ph-pad-x">Status</h3>
            <div className="ph-seg ph-seg-wrap" role="group" aria-label="Status">
              {statuses.map((i) => (
                <button key={i.id} type="button" aria-pressed={i.disabled === 'Current'} disabled={!!i.disabled} onClick={() => p.onRun(i)}>
                  {i.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {trim || check ? <p className="ph-bot-foot ph-muted">Nothing closes automatically.</p> : null}
        </div>
        <button type="button" className="ph-btn ph-acancel" onClick={p.onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface Copy {
  title: string;
  body: string;
  ok: string;
  danger: boolean;
}

const CONFIRM_COPY: Record<Exclude<ConfirmKind, 'bot'>, Copy> = {
  'auto-merge': {
    title: 'Enable auto-merge?',
    body: 'GitHub merges when the required checks and reviews pass.',
    ok: 'Enable auto-merge',
    danger: false,
  },
  'admin-merge': {
    title: 'Admin merge?',
    body: 'Bypasses required review. This merges now and cannot be undone.',
    ok: 'Admin merge',
    danger: true,
  },
  ready: {
    title: 'Mark ready for review?',
    body: 'Takes the PR out of draft. GitHub blocks merging a draft.',
    ok: 'Ready for review',
    danger: false,
  },
  dispatch: {
    title: 'Dispatch with Orca?',
    body: 'Orca starts a worktree and an agent on this issue, then you start work on it.',
    ok: 'Dispatch',
    danger: false,
  },
  'fix-checks': {
    title: 'Dispatch with Orca?',
    body: 'New worktree on the PR branch. The agent fixes the failing checks. PR evidence checks get a description edit, not code.',
    ok: 'Dispatch',
    danger: false,
  },
  'fix-conflicts': {
    title: 'Dispatch with Orca?',
    body: 'New worktree on the PR branch. The agent merges the base branch and resolves conflicts.',
    ok: 'Dispatch',
    danger: false,
  },
};

/** The bot confirm names the configured bot, its label and, when known, the issue. */
function botCopy(issue: { repo: string; number: number } | undefined): Copy {
  const b = bot();
  const where = issue ? ` to ${repoLabel(issue.repo)} #${issue.number}` : '';
  return {
    title: issue ? `Hand #${issue.number} to ${b.name}?` : `Hand to ${b.name}?`,
    body: `Adds the ${b.label} label${where}, creating the label in the repo first if it is missing. ${b.name} starts on its own.`,
    ok: `Hand to ${b.name}`,
    danger: false,
  };
}

const BUSY_LABEL: Partial<Record<ConfirmKind, string>> = {
  'auto-merge': 'Enabling auto-merge...',
  'admin-merge': 'Merging...',
  ready: 'Marking ready...',
  'fix-checks': 'Dispatching...',
  'fix-conflicts': 'Dispatching...',
};

const busyLabel = (kind: ConfirmKind): string | undefined =>
  kind === 'bot' ? `Handing to ${bot().name}...` : BUSY_LABEL[kind];

interface ConfirmProps {
  kind: ConfirmKind;
  subject: string;
  /** The issue a `bot` confirm names in its title and body. */
  issue?: { repo: string; number: number };
  busy: boolean;
  /** When set, confirm stays off until the user types this PR number. */
  requireNumber?: number;
  /** A bold line under the body with a muted note, e.g. what a dispatch launches. */
  detail?: { line: string; sub: string };
  /** The action succeeded: shows this line and a single Done button that closes the sheet. */
  done?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered confirm. Focus starts on Cancel; the confirm button waits 600ms after opening. */
export function PhoneConfirm(p: ConfirmProps) {
  const copy = p.kind === 'bot' ? botCopy(p.issue) : CONFIRM_COPY[p.kind];
  const cancel = useRef<HTMLButtonElement>(null);
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const typedOk = p.requireNumber === undefined || typed.trim() === String(p.requireNumber);
  const trap = useFocusTrap(p.onCancel);
  const height = useKeyboardInset();

  useEffect(() => {
    cancel.current?.focus();
    const t = setTimeout(() => setArmed(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`ph-scrim is-center${height ? ' has-keyboard' : ''}`}
      style={{ zIndex: 70, height: height ? height : undefined }}
      onClick={p.onCancel}
    >
      <div ref={trap} className="ph-confirm" role="alertdialog" aria-modal="true" aria-label={copy.title} onClick={(e) => e.stopPropagation()}>
        <h2>{copy.title}</h2>
        <p className="ph-muted ph-clip">{p.subject}</p>
        <p>{copy.body}</p>
        {p.detail ? (
          <p className="ph-launch">
            <strong>{p.detail.line}</strong>
            <span className="ph-muted">{p.detail.sub}</span>
          </p>
        ) : null}
        {p.requireNumber !== undefined ? (
          <input
            className="ph-input"
            value={typed}
            inputMode="numeric"
            placeholder={`Type ${p.requireNumber} to confirm`}
            aria-label={`Type the PR number ${p.requireNumber} to confirm`}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (armed && !p.busy && typedOk) p.onConfirm();
            }}
          />
        ) : null}
        {p.done !== undefined ? (
          <>
            <p className="ph-done" role="status">
              <CheckIcon size={16} /> {p.done}
            </p>
            <button type="button" className="ph-btn is-primary" onClick={p.onCancel}>
              Done
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`ph-btn ${copy.danger ? 'is-danger' : 'is-primary'}`}
              disabled={!armed || !typedOk}
              aria-disabled={p.busy || undefined}
              aria-busy={p.busy || undefined}
              onClick={() => {
                if (!p.busy) p.onConfirm();
              }}
            >
              {p.busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> {busyLabel(p.kind) ?? 'Working…'}
                </>
              ) : (
                copy.ok
              )}
            </button>
            <button ref={cancel} type="button" className="ph-btn" disabled={p.busy} onClick={p.onCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
