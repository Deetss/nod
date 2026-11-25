import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DISPATCH_ALL_MAX } from '../../shared/findings';
import { DispatchAllRows, PromptCounter, StaleLine, dispatchAllTitle, type DispatchAllProps } from '../DispatchAll';
import { useWorktreeHost } from '../orca/HostPicker';
import { PhoneDispatchFields, usePhoneDispatchFields } from './PhoneFix';
import { PhoneFitSheet, PhoneSheetBar, PhoneSheetError } from './PhoneFitSheet';
import { PhoneSendTo, type SendToCandidate } from './PhoneSendTo';

/** Dispatch all as a bottom sheet: ticked findings, the session or a new worktree, and one editable prompt. */
export function PhoneDispatchAll({ v, onToggle, onEdit, onRebuild, onCancel, onConfirm }: DispatchAllProps) {
  const { offer, busy, repo, number } = v;
  const wh = useWorktreeHost(offer.host);
  const candidates: SendToCandidate[] = [
    ...offer.related.map((s) => ({ s, kind: 'related' as const })),
    ...offer.possible.map((s) => ({ s, kind: 'possible' as const })),
  ];
  const [pick, setPick] = useState(() => {
    const first = v.picked?.session ?? offer.single;
    const i = first ? candidates.findIndex((c) => c.s.id === first.id && c.s.host === first.host) : -1;
    return i >= 0 ? i : candidates.length > 0 ? 0 : candidates.length;
  });
  // With paired hosts the sheet lists the sessions itself; on one machine the picker sheet ran first.
  const listed = wh.multi ? candidates[pick] : undefined;
  const session = wh.multi ? listed?.s : (v.picked?.session ?? offer.single);
  const worktree = session === undefined;
  const d = usePhoneDispatchFields(offer.agents, `pr-${number}-findings`);
  const n = v.rows.filter((r) => r.checked).length;
  const failed = v.error !== undefined && !busy;
  const ready = n > 0 && v.text.trim() !== '' && v.text.length <= DISPATCH_ALL_MAX && (!worktree || d.nameOk);

  const error = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (failed) error.current?.scrollIntoView({ block: 'nearest' });
  }, [failed, v.error]);

  const confirm = (): void => {
    if (session) onConfirm({ kind: 'session', session, ...(listed?.kind === 'related' ? { remember: true } : {}) });
    else {
      const host = wh.multi ? { host: wh.host } : {};
      onConfirm({ kind: 'worktree', request: { agent: d.agent, name: d.name, ...host, baseBranch: offer.headRef, prompt: v.text, pr: true } });
    }
  };

  // The Thread tab sits in a transformed swipe pager, so the sheet mounts on the phone root to stay fixed to the screen.
  return createPortal(
    <PhoneFitSheet
      title={dispatchAllTitle(n)}
      sub={`${repo} #${number}`}
      busy={busy}
      onClose={onCancel}
      bar={
        <PhoneSheetBar
          busy={busy}
          primary={failed ? 'Retry' : `${worktree ? 'Dispatch' : 'Send'} ${n}`}
          busyLabel={worktree ? 'Dispatching...' : 'Sending...'}
          disabled={!ready}
          onCancel={onCancel}
          onPrimary={confirm}
        />
      }
    >
      <div className="ph-dall-label">
        <span>Findings</span>
        <span>{`${n} of ${v.rows.length} ticked`}</span>
      </div>
      <DispatchAllRows rows={v.rows} busy={busy} phone onToggle={onToggle} />
      <div className={`ph-fit-form is-tall ph-dall-form${busy ? ' is-locked' : ''}`}>
        {wh.multi ? (
          <>
            <PhoneSendTo candidates={candidates} pick={pick} busy={busy} repo={`${repo} #${number}`} wh={wh} onPick={setPick} />
            {worktree ? <PhoneDispatchFields d={d} agents={offer.agents} headRef={offer.headRef} busy={busy} /> : null}
          </>
        ) : session ? (
          <>
            <span className="ph-fix-label">Session</span>
            <div className="ph-fit-session" aria-label={`Session ${session.name}`}>
              <span className="ph-fit-dot" aria-hidden="true" />
              <span className="ph-fit-session-name ph-mono">{session.name}</span>
              <span className="ph-fit-pill">{v.picked?.once ? 'Possible' : 'Linked'}</span>
            </div>
          </>
        ) : (
          <>
            <span className="ph-fix-label">Dispatch to</span>
            <p className="ph-fit-note">
              {offer.idle
                ? `No agent on PR #${number}. Reuses ${offer.idle.name} on ${offer.idle.host}.`
                : `No session linked to PR #${number}. New worktree on the PR head.`}
            </p>
            <PhoneDispatchFields d={d} agents={offer.agents} headRef={offer.headRef} busy={busy} />
          </>
        )}
        <label className="ph-fix-label" htmlFor="ph-dall-prompt">
          Prompt
        </label>
        <textarea
          id="ph-dall-prompt"
          spellCheck={false}
          className="ph-fix-field ph-mono ph-fit-area"
          value={v.text}
          readOnly={busy}
          aria-invalid={v.text.length > DISPATCH_ALL_MAX}
          onChange={(e) => onEdit(e.target.value)}
        />
        <PromptCounter length={v.text.length} busy={busy} worktree={worktree} phone />
        {v.stale && !busy ? <StaleLine onRebuild={onRebuild} /> : null}
        {failed ? (
          <div ref={error}>
            <PhoneSheetError>{v.error}</PhoneSheetError>
          </div>
        ) : null}
      </div>
    </PhoneFitSheet>,
    document.querySelector('.phone') ?? document.body,
  );
}
