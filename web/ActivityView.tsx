import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildActivityView,
  groupKey,
  rowMeta,
  stepIndex,
  type ActivityFilter,
  type ActivityRow,
} from '../shared/activity';
import type { ActivityItemRef } from '../shared/activity-types';
import { activityKeyAction } from './activity-keys';
import {
  FILTER_HINTS,
  activityAge,
  activityChipViews,
  activityStatus,
  activitySyncLine,
  clock,
  type ActivityHandle,
} from './activity-ui';
import { ActivityTimeline } from './ActivityTimeline';
import { isTyping } from './hooks';
import { IssueIcon, PrIcon } from './phone/PhoneIcons';
import { Btn } from './ui';
import { repoLabel } from './repo-label';

interface ActivityViewProps {
  activity: ActivityHandle;
  /** False while a dialog owns the keyboard. */
  active: boolean;
  onOpen: (item: ActivityItemRef) => void;
  onHelp: () => void;
  onRefresh: () => void;
  onGoPrs: () => void;
  onGoIssues: () => void;
  onGoActivity: () => void;
}

function Row({ row, selected, onSelect }: { row: ActivityRow; selected: boolean; onSelect: () => void }) {
  const { item, latest } = row;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-row={groupKey(item)}
      className={`act-row${selected ? ' is-selected' : ''}${row.unread ? ' is-unread' : ''}`}
      aria-label={`${row.unread ? 'unread, ' : ''}${item.title}, ${rowMeta(item, latest)}`}
      onClick={onSelect}
    >
      {row.unread ? <span className="act-dot" aria-hidden="true" /> : null}
      <span className="act-icon">{item.kind === 'pr' ? <PrIcon size={18} /> : <IssueIcon size={18} />}</span>
      <span className="act-title">
        <span className="act-text">{item.title}</span>
        {row.updates > 1 ? <span className="act-updates">{row.updates} updates</span> : null}
      </span>
      <span className="act-meta">{rowMeta(item, latest)}</span>
      <span className="act-age">{activityAge(latest.at)}</span>
    </button>
  );
}

/** Layout B on desktop: the item list on the left, the selected item's timeline on the right. */
export function ActivityView(p: ActivityViewProps) {
  const { activity } = p;
  const { feed, error, lastVisit } = activity;
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [showMine, setShowMine] = useState(false);
  const [selected, setSelected] = useState<string>();
  const gPending = useRef(0);

  const view = useMemo(
    () => (feed ? buildActivityView(feed.groups, { viewer: feed.viewer, filter, showMine, lastVisit }) : undefined),
    [feed, filter, showMine, lastVisit],
  );
  const rows = useMemo(() => view?.rows ?? [], [view]);
  const status = activityStatus({ feed, error, view, filter });
  const chips = activityChipViews(status === 'loading' ? undefined : view);
  const current = rows.find((r) => groupKey(r.item) === selected);

  // Handlers read the latest rows and selection through a ref, so the listener binds once per `active`.
  const live = useRef({ rows, current, ...p });
  live.current = { rows, current, ...p };

  useEffect(() => {
    if (!p.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const pending = gPending.current !== 0 && Date.now() - gPending.current < 1000;
      gPending.current = 0;
      if (e.key === 'g' && !pending) {
        gPending.current = Date.now();
        e.preventDefault();
        return;
      }
      const onButton = e.target instanceof HTMLElement && e.target.closest('button, a, summary');
      if (e.key === 'Enter' && onButton) return;
      const action = activityKeyAction(e.key, pending);
      if (!action) return;
      e.preventDefault();
      const l = live.current;
      switch (action) {
        case 'next':
        case 'prev': {
          const at = l.rows.findIndex((r) => groupKey(r.item) === (l.current ? groupKey(l.current.item) : undefined));
          const next = l.rows[stepIndex(at, action === 'next' ? 1 : -1, l.rows.length)];
          if (!next) return;
          const key = groupKey(next.item);
          setSelected(key);
          document.querySelector(`[data-row="${key}"]`)?.scrollIntoView({ block: 'nearest' });
          return;
        }
        case 'open':
          if (l.current) l.onOpen(l.current.item);
          return;
        case 'github':
          if (l.current) window.open(l.current.item.url, '_blank', 'noopener,noreferrer');
          return;
        case 'refresh':
          l.onRefresh();
          return;
        case 'help':
          l.onHelp();
          return;
        case 'escape':
          setSelected(undefined);
          return;
        case 'goPrs':
          l.onGoPrs();
          return;
        case 'goIssues':
          l.onGoIssues();
          return;
        case 'goActivity':
          l.onGoActivity();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.active]);

  const pick = (k: ActivityFilter) => setFilter((f) => (f === k ? 'all' : k));
  const hiddenMine = view?.hiddenMine ?? 0;

  let list;
  if (status === 'loading') {
    list = <p className="act-note muted">Loading activity…</p>;
  } else if (status === 'error') {
    list = (
      <div className="act-note" role="alert">
        <h2>Couldn&apos;t load activity</h2>
        <p className="muted">{error}</p>
        <p className="muted">Showing nothing because no cache exists yet.</p>
        <Btn onClick={activity.reload}>Retry</Btn>
      </div>
    );
  } else if (status === 'empty') {
    list = (
      <div className="act-note">
        <h2>You&apos;re caught up</h2>
        <p className="muted">Nothing has moved since your last visit.</p>
        {hiddenMine > 0 ? <Btn onClick={() => setShowMine(true)}>Show my own ({hiddenMine})</Btn> : null}
      </div>
    );
  } else {
    list = (
      <>
        {feed && error ? (
          <div className="act-note" role="alert">
            <strong>Couldn&apos;t refresh activity</strong>
            <p className="muted">
              {error} Showing the cached list from {clock(feed.syncedAt)}.
            </p>
            <Btn onClick={activity.reload}>Retry</Btn>
          </div>
        ) : null}
        <div role="listbox" aria-label="Activity">
          {rows.map((row) => (
            <Row
              key={groupKey(row.item)}
              row={row}
              selected={current !== undefined && groupKey(current.item) === groupKey(row.item)}
              onSelect={() => setSelected(groupKey(row.item))}
            />
          ))}
        </div>
        {filter !== 'all' ? (
          <p className="act-note muted">
            {rows.length === 0 ? 'No matching items. ' : ''}
            {FILTER_HINTS[filter]}
          </p>
        ) : null}
        <p className="act-note muted">
          {feed?.hasOlder ? (
            <>
              Showing the last {feed.days} days ·{' '}
              <button type="button" className="act-link" onClick={activity.loadOlder}>
                Load older
              </button>
            </>
          ) : (
            `That's everything from the last ${feed?.days ?? 7} days.`
          )}
        </p>
      </>
    );
  }

  return (
    <main className="panes act-panes" aria-label="Activity">
      <section className="pane act-list-pane" aria-label="Activity list">
        <div className="act-chips" role="tablist" aria-label="Activity filter">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={filter === c.key}
              className={`act-chip${filter === c.key ? ' is-active' : ''}`}
              onClick={() => pick(c.key)}
            >
              {c.label} {c.count}
            </button>
          ))}
        </div>
        <div className="act-filterline muted" role="status">
          <span>{status === 'loading' ? 'Loading activity…' : activitySyncLine(feed, view)}</span>
          {status === 'ready' || status === 'empty' ? (
            <span>
              {filter !== 'all' ? (
                <>
                  Showing {rows.length} of {view?.counts.all ?? 0} ·{' '}
                  <button type="button" className="act-link" onClick={() => setFilter('all')}>
                    Clear filter
                  </button>
                  {' · '}
                </>
              ) : null}
              {showMine ? 'Showing mine' : `Mine hidden (${hiddenMine})`} ·{' '}
              <button type="button" className="act-link" onClick={() => setShowMine((s) => !s)}>
                {showMine ? 'Hide' : 'Show'}
              </button>
            </span>
          ) : null}
        </div>
        <div className="scroll">{list}</div>
      </section>
      <section className="pane act-timeline-pane" aria-label="Item timeline">
        {current ? (
          <>
            <div className="act-tl-head">
              <span>
                {repoLabel(current.item.repo)} #{current.item.number} · {current.item.title}
              </span>
              <Btn onClick={() => p.onOpen(current.item)}>
                Open {current.item.kind === 'pr' ? 'PR' : 'issue'}
              </Btn>
            </div>
            <div className="scroll act-tl-body">
              <ActivityTimeline item={current.item} events={current.events} notices={current.notices} />
            </div>
          </>
        ) : (
          <p className="placeholder muted">
            Selecting a row fills this pane with that item&apos;s timeline. Press j or k to move.
          </p>
        )}
      </section>
    </main>
  );
}
