import { useRef, useState } from 'react';
import { oneLine } from '../shared/orca-message';
import { DISPATCH_ALL_MAX } from '../shared/findings';
import { STATE_WORD, type SessionView, type WorktreeView } from '../shared/orca-sessions';
import { AppDialog } from './AppDialog';
import { REUSE_NOTE, ReuseRow, SECOND_NOTE } from './orca/ReuseChoice';
import { SeverityBadge, StatusLine } from './FindingParts';
import { DispatchFields, useDispatchFields } from './orca/DispatchFields';
import { HostFallback, HostTag, NewWorktreeRow, OfflineNote, useWorktreeHost, type WorktreeHost } from './orca/HostPicker';
import { Row } from './orca/SessionPicker';
import { Btn, KeyCap } from './ui';
import type { BulkRow, DispatchAllView, DispatchTarget } from './useFindings';

export interface DispatchAllProps {
  v: DispatchAllView;
  onToggle: (id: string) => void;
  onEdit: (text: string) => void;
  onRebuild: () => void;
  onCancel: () => void;
  onConfirm: (target: DispatchTarget) => void;
}

export const dispatchAllTitle = (n: number): string => `Dispatch ${n} finding${n === 1 ? '' : 's'} to Orca`;

/** Ticked findings: box, severity, file name and line, then the text on one line. The whole row toggles. */
export function DispatchAllRows({ rows, busy, phone, onToggle }: { rows: BulkRow[]; busy: boolean; phone?: boolean; onToggle: (id: string) => void }) {
  return (
    <ul className={`finding-bulk-rows dispatch-all-rows${phone ? ' is-phone' : ''}`}>
      {rows.map(({ finding, checked }) => {
        const t = finding.thread;
        const line = t.line ? `:${t.line}` : '';
        const text = oneLine(finding.text);
        return (
          <li key={t.id}>
            <label className={`finding-bulk-row dispatch-all-row${checked ? '' : ' is-off'}`}>
              <input type="checkbox" className="finding-bulk-check" checked={checked} disabled={busy} onChange={() => onToggle(t.id)} />
              <span className="dispatch-all-head">
                <SeverityBadge severity={finding.severity} />
                <code className="dispatch-all-name" title={`${t.path}${line}`}>{`${t.path.split('/').pop() ?? t.path}${line}`}</code>
              </span>
              <span className="dispatch-all-text" title={text}>
                {text}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** `Edit before sending.` and `605 / 12000`, over adds `too long`. Locked while the request runs. */
export function PromptCounter({ length, busy, worktree, phone }: { length: number; busy: boolean; worktree: boolean; phone?: boolean }) {
  const over = length > DISPATCH_ALL_MAX;
  const note = busy ? 'Fields are locked while sending.' : worktree ? 'Edit before dispatching.' : 'Edit before sending.';
  const count = `${length} / ${DISPATCH_ALL_MAX}${over ? ' too long' : ''}`;
  return phone ? (
    <div className="ph-fit-counter">
      <span>{note}</span>
      <span className={over ? 'is-over' : undefined}>{count}</span>
    </div>
  ) : (
    <div className="orca-counter small">
      <span className="muted">{note}</span>
      <span className={over ? 'orca-over' : 'muted'}>{count}</span>
    </div>
  );
}

/** Shown after an edit when the ticks change: the prompt no longer matches them. */
export function StaleLine({ onRebuild }: { onRebuild: () => void }) {
  return (
    <p className="dispatch-all-stale">
      Ticks changed.{' '}
      <button type="button" className="link-btn" onClick={onRebuild}>
        Rebuild prompt
      </button>
    </p>
  );
}

type Candidate = { s: SessionView; kind: 'related' | 'possible' };

/** The desktop confirm for Dispatch all: ticked findings, the target, and one editable prompt. */
export function DispatchAllDialog({ v, onToggle, onEdit, onRebuild, onCancel, onConfirm }: DispatchAllProps) {
  const { offer, busy, repo, number } = v;
  const n = v.rows.filter((r) => r.checked).length;
  const candidates: Candidate[] = [
    ...offer.related.map((s) => ({ s, kind: 'related' as const })),
    ...offer.possible.map((s) => ({ s, kind: 'possible' as const })),
  ];
  const wh = useWorktreeHost(offer.host);
  const [changing, setChanging] = useState(false);
  const [pick, setPick] = useState(() => Math.max(0, candidates.findIndex((c) => c.s.id === offer.single?.id)));
  const f = useDispatchFields(offer.agents, `pr-${number}-findings`);
  const primary = useRef<HTMLButtonElement>(null);

  // With paired hosts or an idle worktree, the list ends with the idle worktree, then a New worktree row.
  const { idle } = offer;
  const path = offer.single && !changing ? 'session' : candidates.length > 0 || wh.multi || idle ? 'pick' : 'worktree';
  const worktree = path === 'worktree' || (path === 'pick' && pick >= candidates.length);
  const reusing = idle !== undefined && path === 'pick' && pick === candidates.length;
  const over = v.text.length > DISPATCH_ALL_MAX;
  const ready = n > 0 && !over && v.text.trim() !== '' && (!worktree || (reusing ? f.m.choice.valid : f.valid));
  const failed = v.error !== undefined && !busy;

  const target = (): DispatchTarget | undefined => {
    if (path === 'session' && offer.single) return { kind: 'session', session: offer.single };
    const c = candidates[pick];
    if (path === 'pick' && !worktree) return c ? { kind: 'session', session: c.s, remember: c.kind === 'related' } : undefined;
    const base = { ...f.request(), baseBranch: offer.headRef, prompt: v.text, pr: true };
    if (reusing) return { kind: 'worktree', request: base };
    return { kind: 'worktree', request: { ...base, ...(wh.multi ? { host: wh.host } : {}), ...(idle ? { newWorktree: true } : {}) } };
  };
  const go = (): void => {
    const t = busy || !ready ? undefined : target();
    if (t) onConfirm(t);
  };

  const head = (
    <>
      <label className="field-label" htmlFor="da-head">
        Head branch
      </label>
      <input id="da-head" className="dispatch-locked mono" value={offer.headRef} readOnly />
      <span className="muted small">Locked. The agent works on the PR head and pushes its fix there.</span>
    </>
  );

  return (
    <AppDialog
      title={dispatchAllTitle(n)}
      busy={busy}
      width={560}
      className="dispatch-dialog finding-dispatch-all"
      initialFocusRef={primary}
      onClose={onCancel}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        go();
      }}
      footer={
        <>
          <Btn disabled={busy} onClick={onCancel}>
            Cancel <KeyCap>Esc</KeyCap>
          </Btn>
          <button
            ref={primary}
            type="button"
            className={`btn btn-primary${busy ? ' is-busy' : ''}`}
            disabled={!busy && !ready}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onClick={go}
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {worktree ? 'Dispatching...' : 'Sending...'}
              </>
            ) : (
              <>
                {failed ? 'Retry' : `${worktree ? 'Dispatch' : 'Send'} ${n}`}
                <KeyCap>Ctrl+Enter</KeyCap>
              </>
            )}
          </button>
        </>
      }
    >
      <p className="muted small">{`${repo} #${number}`}</p>
      <p className="muted small">One prompt with every ticked finding. Human threads are left out.</p>
      <div className={`dispatch-all-body${busy ? ' is-locked' : ''}`}>
        <div className="dispatch-all-field">
          <div className="dispatch-all-label">
            <span className="field-label">Findings</span>
            <span className="muted small">{`${n} of ${v.rows.length} ticked`}</span>
          </div>
          <DispatchAllRows rows={v.rows} busy={busy} onToggle={onToggle} />
        </div>
        <div className="dispatch-all-field">
          <div className="dispatch-all-label">
            <span className="field-label">{path === 'worktree' ? 'Dispatch to' : 'Send to'}</span>
            {path === 'pick' ? <span className="muted small">{`${offer.related.length} related, ${offer.possible.length} possible`}</span> : null}
          </div>
          {path === 'session' && offer.single ? (
            <div className="dispatch-all-session" aria-label={`Session ${offer.single.name}`}>
              <span className="ph-fit-dot" aria-hidden="true" />
              <span className="dispatch-all-session-name mono">{offer.single.name}</span>
              <span className="ph-fit-pill">Linked</span>
              <HostTag host={offer.single.host} />
              <span className="dispatch-all-state muted small">{STATE_WORD[offer.single.state]}</span>
              {(candidates.length > 1 || wh.multi || idle) && !busy ? (
                <button type="button" className="btn finding-btn" onClick={() => setChanging(true)}>
                  Change
                </button>
              ) : null}
            </div>
          ) : null}
          {path === 'pick' ? (
            <SessionChoice candidates={candidates} pick={pick} busy={busy} idle={idle} worktreeRow={wh.multi || idle ? wh : undefined} onPick={setPick} />
          ) : null}
          {path === 'pick' && worktree ? (
            <div className="dispatch-all-worktree">
              {idle ? <span className="muted small">{reusing ? REUSE_NOTE : SECOND_NOTE}</span> : null}
              {reusing ? <DispatchFields f={f} agents={offer.agents} hideName disabled={busy} /> : <DispatchFields f={f} agents={offer.agents} paired disabled={busy} />}
              {head}
            </div>
          ) : null}
          {path === 'worktree' ? (
            <div className="dispatch-all-worktree">
              <span className="muted small">{`No Orca session linked to PR #${number}. A new worktree opens on the PR head.`}</span>
              <DispatchFields f={f} agents={offer.agents} paired disabled={busy} />
              {head}
            </div>
          ) : null}
        </div>
        <div className="dispatch-all-field">
          <label className="field-label" htmlFor="da-prompt">
            Prompt
          </label>
          <textarea
            id="da-prompt"
            rows={10}
            spellCheck={false}
            value={v.text}
            readOnly={busy}
            aria-invalid={over}
            onChange={(e) => onEdit(e.target.value)}
          />
          <PromptCounter length={v.text.length} busy={busy} worktree={worktree} />
          {v.stale && !busy ? <StaleLine onRebuild={onRebuild} /> : null}
        </div>
        {failed ? <StatusLine tone="err">{v.error}</StatusLine> : null}
      </div>
    </AppDialog>
  );
}

interface ChoiceProps {
  candidates: Candidate[];
  pick: number;
  busy: boolean;
  /** The PR's worktree with no agent, at index `candidates.length`. */
  idle?: WorktreeView;
  /** A New worktree row closes the list, after the sessions and any idle worktree. */
  worktreeRow: WorktreeHost | undefined;
  onPick: (i: number) => void;
}

/** Related and possible sessions with a radio. Up and Down move the choice. */
function SessionChoice({ candidates, pick, busy, idle, worktreeRow, onPick }: ChoiceProps) {
  const group = (kind: Candidate['kind']) => candidates.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === kind);
  const related = group('related');
  const possible = group('possible');
  const newAt = candidates.length + (idle ? 1 : 0);
  const last = worktreeRow ? newAt : newAt - 1;
  const rows = (list: typeof related) =>
    list.map(({ c, i }) => (
      <Row key={`${c.s.host}|${c.s.id}`} s={c.s} focused={pick === i} radio hint={c.kind === 'possible' ? 'Send once' : ''} onPick={() => !busy && onPick(i)} />
    ));
  return (
    <>
      <div
        className="picker-list orca-picker-list dispatch-all-pick"
        role="listbox"
        tabIndex={0}
        aria-label="Session"
        onKeyDown={(e) => {
          if (busy || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
          e.preventDefault();
          onPick(Math.min(last, Math.max(0, pick + (e.key === 'ArrowDown' ? 1 : -1))));
        }}
      >
        {related.length > 0 ? (
          <>
            <div className="orca-group">
              <span>RELATED</span>
              <span className="orca-group-count">{related.length} match</span>
            </div>
            {rows(related)}
          </>
        ) : null}
        {possible.length > 0 ? (
          <>
            <div className={`orca-group${related.length > 0 ? ' orca-group-split' : ''}`}>
              <span>POSSIBLE</span>
            </div>
            {rows(possible)}
          </>
        ) : null}
        {idle ? <ReuseRow w={idle} on={pick === candidates.length} busy={busy} onSelect={() => onPick(candidates.length)} /> : null}
        {worktreeRow ? (
          <NewWorktreeRow
            hosts={worktreeRow.hosts}
            host={worktreeRow.host}
            on={pick === newAt}
            busy={busy}
            radio
            onSelect={() => onPick(newAt)}
            onPick={worktreeRow.pick}
          />
        ) : null}
      </div>
      {worktreeRow ? (
        <>
          <HostFallback fallback={idle && pick === candidates.length ? undefined : worktreeRow.fallback} />
          <OfflineNote hosts={worktreeRow.hosts} className="muted small orca-offline-note" />
        </>
      ) : null}
      {candidates.length > 0 ? (
        <span className="muted small">Your choice is remembered for this PR. A possible match only gets the message you send now.</span>
      ) : null}
    </>
  );
}
