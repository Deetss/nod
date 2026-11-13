import { useEffect, useMemo, useRef, useState } from 'react';
import { SUB_ISSUE_LIMIT, type IssueSummary, type SubIssue } from '../../shared/issue-types';
import { parseNumberQuery } from '../../shared/number-query';
import { subRef } from '../../shared/sub-issues';
import { Btn } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import { useNumberLookup } from '../useNumberLookup';
import type { AddCandidate } from './useSubIssues';
import { CircleDotIcon } from './parts';
import { repoLabel } from '../repo-label';

interface ParentRef {
  repo: string;
  number: number;
}

const refText = (p: ParentRef): string => `${repoLabel(p.repo)} #${p.number}`;

interface CreateProps {
  parent: ParentRef;
  repos: string[];
  /** Creates and links; rejects with GitHub's message. */
  onCreate: (repo: string, title: string, body: string) => Promise<unknown>;
  onCancel: () => void;
}

/** State 3: one createIssue call with parentIssueId. The repo defaults to the parent's. */
export function CreateSubIssueDialog(p: CreateProps) {
  const [repo, setRepo] = useState(p.parent.repo);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const titleRef = useRef<HTMLInputElement>(null);
  const trap = useFocusTrap();
  useEffect(() => titleRef.current?.focus(), []);
  const repos = p.repos.includes(p.parent.repo) ? p.repos : [p.parent.repo, ...p.repos];
  const ready = title.trim() !== '' && !busy;

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    try {
      await p.onCreate(repo, title.trim(), body);
      if (!another) return p.onCancel();
      setTitle('');
      titleRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="dialog sub-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create sub-issue"
        aria-busy={busy || undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void create();
        }}
      >
        <div className="dialog-head">
          <h2>
            Create sub-issue <span className="muted sub-under">under {refText(p.parent)}</span>
          </h2>
          <span className="muted small">Esc</span>
        </div>
        <label className="field-label" htmlFor="si-repo">
          Repository
        </label>
        <select id="si-repo" value={repo} onChange={(e) => setRepo(e.target.value)}>
          {repos.map((r) => (
            <option key={r} value={r}>
              {repoLabel(r)}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="si-title">
          Title
        </label>
        <input id="si-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="field-label" htmlFor="si-body">
          Body <span className="muted">optional</span>
        </label>
        <textarea id="si-body" className="sub-body" value={body} placeholder="Markdown supported." onChange={(e) => setBody(e.target.value)} />
        <div className="sub-dialog-foot">
          <label className="sub-another">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} /> Create another
          </label>
          <div className="dialog-actions">
            <Btn keyHint="Esc" onClick={p.onCancel}>
              Cancel
            </Btn>
            <Btn primary keyHint={busy ? undefined : 'Ctrl+Enter'} disabled={!ready} onClick={() => void create()}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Creating...
                </>
              ) : (
                'Create'
              )}
            </Btn>
          </div>
        </div>
        {error ? (
          <p className="sub-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface PickRow extends AddCandidate {
  key: string;
  /** Sub line under the title. */
  note: string;
  tone: 'plain' | 'attention' | 'inert';
}

/** Rows for the add-existing picker: tracked issues first, then a number lookup's hits. */
export function addRows(
  issues: readonly IssueSummary[],
  parent: ParentRef,
  q: string,
  looked: readonly { repo: string; number: number; title: string }[] = [],
): PickRow[] {
  const isParent = (i: ParentRef) => i.repo === parent.repo && i.number === parent.number;
  const num = parseNumberQuery(q);
  const text = q.trim().toLowerCase();
  const hit = (i: IssueSummary) =>
    num
      ? i.number === num.number && (num.repo === undefined || i.repo.toLowerCase() === num.repo.toLowerCase())
      : text === '' || i.title.toLowerCase().includes(text);
  const listed: PickRow[] = issues
    .filter((i) => !isParent(i) && hit(i))
    .map((i) => {
      const under = i.parent && isParent(i.parent);
      const moves = !under && i.parent !== undefined;
      return {
        key: i.id,
        repo: i.repo,
        number: i.number,
        title: i.title,
        moves,
        note: under ? `Already a sub-issue of #${parent.number}` : moves && i.parent ? `Has parent ${refText(i.parent)}. Adding moves it here.` : 'No parent',
        tone: under ? 'inert' : moves ? 'attention' : 'plain',
      };
    });
  const extra: PickRow[] = looked
    .filter((h) => !isParent(h) && !listed.some((r) => r.repo === h.repo && r.number === h.number))
    .map((h) => ({ key: `${h.repo}#${h.number}`, ...h, moves: false, note: 'Found on GitHub', tone: 'plain' }));
  return [...listed, ...extra].slice(0, 50);
}

interface AddProps {
  parent: ParentRef;
  issues: readonly IssueSummary[];
  repos: string[];
  used: number;
  onAdd: (c: AddCandidate) => void;
  onCancel: () => void;
}

/** State 4: filter tracked issues by title, or look one up by number. Enter adds the focused row. */
export function AddExistingPicker(p: AddProps) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trap = useFocusTrap();
  useEffect(() => input.current?.focus(), []);
  const num = parseNumberQuery(q);
  const lookupRepos = num?.repo ? p.repos.filter((r) => r.toLowerCase() === num.repo?.toLowerCase()) : p.repos;
  const lookup = useNumberLookup(num?.number, num ? lookupRepos : []);
  const looked = useMemo(() => lookup.hits.filter((h) => h.kind === 'issue'), [lookup.hits]);
  const rows = useMemo(() => addRows(p.issues, p.parent, q, looked), [p.issues, p.parent, q, looked]);
  const at = Math.min(focus, Math.max(0, rows.length - 1));

  const pick = (row: PickRow | undefined) => {
    if (!row || row.tone === 'inert') return;
    p.onAdd(row);
  };

  return (
    <div className="scrim picker-scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="picker picker-center sub-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Add existing issue"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            p.onCancel();
          } else if (e.key === 'ArrowDown') setFocus(Math.min(rows.length - 1, at + 1));
          else if (e.key === 'ArrowUp') setFocus(Math.max(0, at - 1));
          else if (e.key === 'Enter') pick(rows[at]);
          else return;
          e.preventDefault();
        }}
      >
        <div className="sub-picker-head">
          <h2 className="picker-title">
            Add existing issue <span className="muted sub-under">to {refText(p.parent)}</span>
          </h2>
          <span className="muted small">Esc</span>
        </div>
        <input
          ref={input}
          className="picker-filter"
          value={q}
          placeholder="Filter by title, or #421"
          aria-label="Filter issues"
          onChange={(e) => {
            setQ(e.target.value);
            setFocus(0);
          }}
        />
        <p className="muted small sub-caption">Title matches in tracked repos. Type #421 or acme-api#421 to look up any issue by number.</p>
        <div className="picker-list sub-picker-list" role="listbox" aria-label="Issues">
          {rows.length === 0 ? (
            <div className="muted picker-msg">{num && !lookup.done ? 'Looking up...' : lookup.error ?? 'No matching issues.'}</div>
          ) : null}
          {rows.map((r, i) => (
            <div
              key={r.key}
              role="option"
              aria-selected={i === at}
              aria-disabled={r.tone === 'inert' || undefined}
              className={`picker-row fix-menu-row sub-pick${i === at ? ' is-focus' : ''}${r.tone === 'inert' ? ' is-disabled' : ''}`}
              onMouseEnter={() => setFocus(i)}
              onClick={() => pick(r)}
            >
              <span className="sub-glyph sub-glyph-open">
                <CircleDotIcon size={14} />
              </span>
              <span className="fix-menu-text">
                <span className="sub-pick-title">
                  <strong className="muted">{refText(r)}</strong> {r.title}
                </span>
                <span className={`fix-menu-sub${r.tone === 'attention' ? ' sub-attention' : ''}`}>{r.note}</span>
              </span>
              {i === at && r.tone !== 'inert' ? <span className="picker-act muted">Enter</span> : null}
            </div>
          ))}
        </div>
        <div className="sub-picker-foot muted small">
          <span>Enter add · ↑↓ move · Esc close</span>
          <span>
            {p.used} of {SUB_ISSUE_LIMIT} used
          </span>
        </div>
      </div>
    </div>
  );
}

interface RemoveProps {
  parent: ParentRef;
  child: SubIssue;
  onConfirm: () => void;
  onCancel: () => void;
}

/** State 6: unlinking only. The child keeps its state and history. */
export function RemoveSubIssueDialog(p: RemoveProps) {
  const trap = useFocusTrap();
  const removeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => removeRef.current?.focus(), []);
  const keeps = p.child.state === 'open' ? 'stays open' : 'stays closed';
  return (
    <div className="scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="dialog sub-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Remove sub-issue?"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
        }}
      >
        <div className="dialog-head">
          <h2>Remove sub-issue?</h2>
          <span className="muted small">Esc</span>
        </div>
        <p>
          {repoLabel(p.child.repo)} {subRef(p.child, p.child.repo)} “{p.child.title}” {keeps} and keeps its history. Only its link to #{p.parent.number} is removed.
        </p>
        <div className="dialog-actions">
          <Btn keyHint="Esc" onClick={p.onCancel}>
            Cancel
          </Btn>
          <button ref={removeRef} type="button" className="btn btn-danger" onClick={p.onConfirm}>
            Remove <span className="kbd">Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
