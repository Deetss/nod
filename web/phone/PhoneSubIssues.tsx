import { useRef } from 'react';
import type { ParentIssue, SubIssue } from '../../shared/issue-types';
import { progressOf, subRef } from '../../shared/sub-issues';
import { SubStateGlyph } from '../issues/parts';
import { useFocusTrap } from '../useFocusTrap';
import type { NewIssueForm } from './new-issue';
import { ChevronIcon, PlusIcon } from './PhoneIcons';
import { FieldRow } from './PhonePickerParts';
import { PhoneSheet } from './PhoneSheet';
import { useKeyboardInset } from './useKeyboardInset';
import { repoLabel } from '../repo-label';

/** Phone sub-issues (docs/design/sub-issues-spec.md §6). No reorder and no add-existing here. */

const LONG_PRESS_MS = 500;

const STATE_WORD: Record<SubIssue['state'], string> = { open: 'open', completed: 'closed', 'not-planned': 'not planned' };

/** `#14 · closed · build-bot`; the repo shows when it differs from the parent's. */
export function subMeta(child: SubIssue, parentRepo: string): string {
  return [subRef(child, parentRepo), STATE_WORD[child.state], child.assignee].filter(Boolean).join(' · ');
}

interface RowProps {
  child: SubIssue;
  parentRepo: string;
  onOpen: () => void;
  onLong: () => void;
}

/** Tap opens the sub-issue; a long press, or the context menu, opens its row sheet. */
function SubRow({ child, parentRepo, onOpen, onLong }: RowProps) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  const stop = () => clearTimeout(timer.current);
  return (
    <button
      type="button"
      className={`ph-sub-row${child.state === 'open' ? '' : ' is-closed'}`}
      aria-description="Long press for more"
      onPointerDown={() => {
        fired.current = false;
        timer.current = setTimeout(() => {
          fired.current = true;
          onLong();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => {
        e.preventDefault();
        stop();
        if (!fired.current) onLong();
        fired.current = true;
      }}
      onClick={() => {
        if (fired.current) fired.current = false;
        else onOpen();
      }}
    >
      <SubStateGlyph state={child.state} />
      <span className="ph-sub-text">
        <span className="ph-sub-title">{child.title}</span>
        <span className="ph-sub-meta">{subMeta(child, parentRepo)}</span>
      </span>
      <span className="ph-sub-av">{child.assignee ? <span className="ph-av">{child.assignee.slice(0, 1).toUpperCase()}</span> : null}</span>
      <ChevronIcon open={false} />
    </button>
  );
}

interface SectionProps {
  parentRepo: string;
  subs: SubIssue[] | undefined;
  writesOff: boolean;
  onOpen: (child: SubIssue) => void;
  onLong: (child: SubIssue) => void;
  onCreate: () => void;
}

/** Details tab section, after Status. */
export function PhoneSubIssuesSection(p: SectionProps) {
  const subs = p.subs ?? [];
  const progress = progressOf(subs);
  return (
    <section className="ph-subs" aria-label="Sub-issues">
      <div className="ph-subs-h">
        <span className="ph-kv-key">Sub-issues</span>
        {progress.total > 0 ? (
          <>
            <span className="progress ph-subs-bar" aria-hidden="true">
              <div style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
            </span>
            <span className="ph-subs-done">
              {progress.completed} of {progress.total} done
            </span>
          </>
        ) : null}
      </div>
      {p.subs === undefined ? <p className="ph-subs-none ph-muted">Loading…</p> : null}
      {p.subs && subs.length === 0 ? <p className="ph-subs-none ph-muted">None yet. Break this issue into smaller ones.</p> : null}
      {subs.map((c) => (
        <SubRow key={c.id} child={c} parentRepo={p.parentRepo} onOpen={() => p.onOpen(c)} onLong={() => p.onLong(c)} />
      ))}
      <div className="ph-subs-foot">
        <button type="button" className={`ph-btn ph-subs-create${p.writesOff ? ' is-off' : ''}`} disabled={p.writesOff} onClick={p.onCreate}>
          <PlusIcon /> Create sub-issue
        </button>
      </div>
    </section>
  );
}

/** Pinned under the sheet head of a sub-issue. Tap opens the parent. */
export function PhoneParentRow({ parent, onOpen }: { parent: ParentIssue; onOpen: () => void }) {
  return (
    <button type="button" className="ph-parent" onClick={onOpen} aria-label={`Parent ${repoLabel(parent.repo)} #${parent.number} ${parent.title}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="ph-parent-key">Parent</span>
      <SubStateGlyph state={parent.state} size={14} />
      <strong className="ph-parent-num">#{parent.number}</strong>
      <span className="ph-parent-title">{parent.title}</span>
      <ChevronIcon open={false} />
    </button>
  );
}

interface CreateProps {
  parent: { repo: string; number: number };
  form: NewIssueForm;
  writesOff: boolean;
  busy: boolean;
  depth: number;
  covered: boolean;
  onChange: (form: NewIssueForm) => void;
  onPickRepo: () => void;
  onCreate: () => void;
  onClose: () => void;
}

/** P4: repo, title and body, then one createIssue call with the parent set. */
export function PhoneCreateSubIssue(p: CreateProps) {
  const { form } = p;
  const height = useKeyboardInset();
  const can = form.title.trim() !== '' && !p.writesOff && !p.busy;
  return (
    <PhoneSheet
      title="Create sub-issue"
      sub={`under ${repoLabel(p.parent.repo)} #${p.parent.number}`}
      depth={p.depth}
      covered={p.covered}
      keyboardHeight={height}
      onClose={() => !p.busy && p.onClose()}
      bar={
        <>
          <button
            type="button"
            className={`ph-btn is-primary${can || p.busy ? '' : ' is-off'}`}
            disabled={!can && !p.busy}
            aria-busy={p.busy || undefined}
            onClick={() => can && p.onCreate()}
          >
            {p.busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Creating...
              </>
            ) : (
              'Create sub-issue'
            )}
          </button>
          <button type="button" className="ph-btn" disabled={p.busy} onClick={p.onClose}>
            Cancel
          </button>
        </>
      }
    >
      <FieldRow label="Repository" spoken={form.repo} off={p.busy} note="" onOpen={p.onPickRepo}>
        <span className="ph-field-text">{repoLabel(form.repo)}</span>
      </FieldRow>
      <div className="ph-pad ph-nif">
        <label className="ph-nif-label" htmlFor="ph-sub-title">
          Title
        </label>
        <input
          id="ph-sub-title"
          className="ph-input"
          type="text"
          value={form.title}
          readOnly={p.busy}
          required
          enterKeyHint="done"
          onChange={(e) => p.onChange({ ...form, title: e.target.value })}
        />
        <label className="ph-nif-label" htmlFor="ph-sub-body">
          Body <span className="ph-muted">optional</span>
        </label>
        <textarea
          id="ph-sub-body"
          className="ph-input ph-sub-body"
          value={form.body}
          placeholder="Markdown supported."
          readOnly={p.busy}
          onChange={(e) => p.onChange({ ...form, body: e.target.value })}
        />
        <p className="ph-muted ph-sub-note">Repo defaults to the parent&apos;s. One createIssue call.</p>
      </div>
    </PhoneSheet>
  );
}

interface RowSheetProps {
  parentNumber: number;
  child: SubIssue;
  parentRepo: string;
  writesOff: boolean;
  onOpen: () => void;
  onGithub: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** P5: long-press sheet for one sub-issue. */
export function PhoneSubRowSheet(p: RowSheetProps) {
  const trap = useFocusTrap(p.onClose);
  const ref = subRef(p.child, p.parentRepo);
  const keeps = p.child.state === 'open' ? 'stays open' : 'stays closed';
  return (
    <div className="ph-scrim" style={{ zIndex: 60 }} onClick={p.onClose}>
      <div ref={trap} className="ph-asheet" role="dialog" aria-modal="true" aria-label={`${repoLabel(p.child.repo)} #${p.child.number}`} onClick={(e) => e.stopPropagation()}>
        <span className="ph-handle" aria-hidden="true" />
        <h2 className="ph-asheet-title">
          {repoLabel(p.child.repo)} #{p.child.number}
        </h2>
        <div className="ph-asheet-body">
          <button type="button" className="ph-arow" onClick={p.onOpen}>
            <span className="ph-arow-text">
              <span className="ph-arow-title">Open {ref}</span>
              <span className="ph-arow-sub">{p.child.title}</span>
            </span>
            <ChevronIcon open={false} />
          </button>
          <button type="button" className="ph-arow" onClick={p.onGithub}>
            <span className="ph-arow-text">
              <span className="ph-arow-title">Open on GitHub</span>
            </span>
          </button>
          <button type="button" className="ph-arow ph-arow-danger" disabled={p.writesOff} onClick={p.onRemove}>
            <span className="ph-arow-text">
              <span className="ph-arow-title">Remove from #{p.parentNumber}</span>
              <span className="ph-arow-sub">
                {p.writesOff ? 'Offline' : `Unlinks only. ${ref} ${keeps}`}
              </span>
            </span>
          </button>
        </div>
        <button type="button" className="ph-btn ph-acancel" onClick={p.onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface RemoveProps {
  parentNumber: number;
  child: SubIssue;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** P6: unlinking only, so the child keeps its state. */
export function PhoneRemoveSub(p: RemoveProps) {
  const trap = useFocusTrap(p.onCancel);
  const keeps = p.child.state === 'open' ? 'stays open' : 'stays closed';
  return (
    <div className="ph-scrim is-center" style={{ zIndex: 80 }} onClick={() => !p.busy && p.onCancel()}>
      <div ref={trap} className="ph-confirm" role="alertdialog" aria-modal="true" aria-label={`Remove from #${p.parentNumber}?`} onClick={(e) => e.stopPropagation()}>
        <h2>Remove from #{p.parentNumber}?</h2>
        <p>
          {repoLabel(p.child.repo)} #{p.child.number} “{p.child.title}” {keeps}. Only the link to the parent is removed.
        </p>
        <div className="ph-confirm-row">
          <button type="button" className="ph-btn" disabled={p.busy} onClick={p.onCancel}>
            Cancel
          </button>
          <button type="button" className="ph-btn is-danger" aria-busy={p.busy || undefined} onClick={() => !p.busy && p.onConfirm()}>
            {p.busy ? (
              <>
                <span className="spinner" aria-hidden="true" /> Removing...
              </>
            ) : (
              'Remove'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
