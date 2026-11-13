/**
 * MentionTextarea: a textarea with a docked @mention strip.
 *
 * Props beyond the textarea attributes (`value`, `onValueChange` and `repo` are required):
 * - `repo`: `owner/name`. Repo members come from `useRepoPeople`, fetched on the first `@`.
 * - `people`: ranked people already on screen (author, reviewers, assignees, commenters).
 *   The first source to name a login keeps it.
 * - `teams`: the viewer's team slugs in `repo`'s owner. Each shows as `owner/team` with a square avatar.
 * - `placement`: `below` (default) docks the strip under the textarea; `above` puts it over the textarea.
 * - `textareaRef`: optional ref to the textarea element, for focus and caret code in the host.
 *
 * Keys while the strip is open: Up/Down move, Enter or Tab insert `@login `, Esc closes the strip
 * only (the text stays). Ctrl or Cmd+Enter passes through so the host can still send.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from 'react';
import { filterCandidates, insertMention, mentionTrigger, rankCandidates, type MentionCandidate } from './mention-logic';
import { useRepoPeople } from './useRepoPeople';
import { repoOwner } from '../../shared/repo-name';

const VISIBLE = 4;
const ROW_H = 48;

export interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  repo: string;
  people?: readonly MentionCandidate[];
  teams?: readonly string[];
  placement?: 'below' | 'above';
  textareaRef?: Ref<HTMLTextAreaElement>;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

export function MentionTextarea(p: MentionTextareaProps) {
  const { value, onValueChange, repo, people = [], teams = [], placement = 'below', textareaRef, onKeyDown, ...rest } = p;
  const [trigger, setTrigger] = useState<{ start: number; query: string } | undefined>();
  const [dismissed, setDismissed] = useState<number | undefined>();
  const [active, setActive] = useState(0);
  const [first, setFirst] = useState(0);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();
  const repoPeople = useRepoPeople(repo);
  const open = trigger !== undefined && trigger.start !== dismissed;
  const query = trigger?.query ?? '';

  const teamRows: MentionCandidate[] = teams.map((t) => ({
    kind: 'team',
    login: `${repoOwner(repo)}/${t}`,
    reason: 'team you are in',
  }));
  const list = open ? filterCandidates(rankCandidates(people, teamRows, repoPeople.people), query) : [];
  const loading = open && repoPeople.loading && list.length === 0;
  const noMatch = open && !loading && list.length === 0;
  const showList = open && !loading && !noMatch;

  useEffect(() => {
    if (open) repoPeople.ensure();
  }, [open, repoPeople.ensure]);

  // Keep paging while the typed text has fewer matches than rows, until GitHub has no more pages.
  useEffect(() => {
    if (open && repoPeople.hasNext && !repoPeople.loading && list.length < VISIBLE) repoPeople.loadMore();
  }, [open, repoPeople.hasNext, repoPeople.loading, list.length, repoPeople.loadMore]);

  const sel = Math.min(active, Math.max(0, list.length - 1));
  const top = Math.min(first, Math.max(0, list.length - VISIBLE));
  const shown = list.slice(top, top + VISIBLE);
  const rowId = (i: number) => `${listId}-row-${i}`;
  const rest_ = list.length - VISIBLE;

  function move(delta: number) {
    const n = list.length;
    const next = (sel + delta + n) % n;
    setActive(next);
    // Keep the selected row inside the four-row window; wrapping jumps the window.
    setFirst(next < top ? next : next >= top + VISIBLE ? next - VISIBLE + 1 : top);
  }

  function insert(c: MentionCandidate) {
    const el = area.current;
    if (!trigger || !el) return;
    const out = insertMention(value, trigger.start, el.selectionStart, c.login);
    setTrigger(undefined);
    setDismissed(undefined);
    onValueChange(out.text);
    requestAnimationFrame(() => el.setSelectionRange(out.caret, out.caret));
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const t = mentionTrigger(text, e.target.selectionStart);
    setTrigger(t);
    if (!t) setDismissed(undefined);
    // A new query or a new `@` restarts the selection at the top of the list.
    if (!t || t.start !== trigger?.start || t.query !== trigger.query) {
      setActive(0);
      setFirst(0);
    }
    onValueChange(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && !e.nativeEvent.isComposing) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
        e.preventDefault();
        move(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if ((e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) || e.key === 'Tab') {
        if (showList) {
          e.preventDefault();
          const chosen = list[sel];
          if (chosen) insert(chosen);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(trigger?.start);
        return;
      }
      // Send passes through to the host, and the strip closes first.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) setTrigger(undefined);
    }
    onKeyDown?.(e);
  }

  const status = loading
    ? 'Loading people'
    : noMatch
      ? `No one matches @${query}`
      : list.length === 1
        ? '1 person matches'
        : `${list.length} people match`;
  const hint = rest_ > 0 ? `+${rest_} more, scroll` : 'Up/Down move · Enter or Tab insert · Esc close';

  const strip = open ? (
    <div className="mention-strip" data-state={loading ? 'loading' : noMatch ? 'empty' : 'list'} style={{ minHeight: loading || noMatch ? undefined : 24 + VISIBLE * ROW_H }}>
      {loading ? (
        <div className="mention-loading" aria-busy="true">
          <div className="mention-hint">Loading people…</div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row sk" />
          ))}
        </div>
      ) : noMatch ? (
        <>
          <div className="mention-hint">No one matches @{query}.</div>
          <div className="mention-hint">Keep typing, or Esc closes the list.</div>
        </>
      ) : (
        <>
          <div className="mention-hint" aria-hidden="true">
            {hint}
          </div>
          <div id={listId} role="listbox" aria-label="People and teams you can mention" className="mention-list">
            {shown.map((c, i) => {
              const index = top + i;
              const selected = index === sel;
              return (
                <div
                  key={`${c.kind}:${c.login}`}
                  id={rowId(index)}
                  role="option"
                  aria-selected={selected}
                  aria-label={`${c.login}, ${c.reason}`}
                  className={`mention-row${selected ? ' is-selected' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(c);
                  }}
                >
                  {c.kind === 'team' ? (
                    <span className="avatar avatar-square avatar-initial" aria-hidden="true">
                      {c.login.slice(0, 1).toUpperCase()}
                    </span>
                  ) : c.avatarUrl ? (
                    <img className="avatar" src={c.avatarUrl} alt="" width={24} height={24} />
                  ) : (
                    <span className="avatar avatar-initial" aria-hidden="true">
                      {c.login.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="mention-name">
                    <strong>@{c.login}</strong>
                    <span className="mention-reason">{c.reason}</span>
                  </span>
                  {selected ? <kbd className="kbd">Enter</kbd> : null}
                </div>
              );
            })}
          </div>
        </>
      )}
      <span className="sr-only" role="status">
        {status}
      </span>
    </div>
  ) : null;

  const field = (
    <textarea
      {...rest}
      ref={(el) => {
        area.current = el;
        setRef(textareaRef, el);
      }}
      value={value}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showList}
      aria-controls={showList ? listId : undefined}
      aria-activedescendant={showList && list.length ? rowId(sel) : undefined}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );

  return (
    <div className={`mention-host mention-${placement}`}>
      {placement === 'above' ? strip : null}
      {field}
      {placement === 'above' ? null : strip}
    </div>
  );
}
