import { useMemo, useState } from 'react';
import { buildActivityView, groupKey, rowMeta, type ActivityFilter, type ActivityRow } from '../../shared/activity';
import {
  FILTER_HINTS,
  activityAge,
  activityChipViews,
  activitySyncLine,
  activityStatus,
  clock,
  type ActivityHandle,
} from '../activity-ui';
import { ActivityTimeline } from '../ActivityTimeline';
import { Chips } from './PhoneBars';
import { PullList } from './PhoneList';
import { CrossCircleIcon, CheckCircleIcon, IssueIcon, PrIcon } from './PhoneIcons';
import type { ActivityItemRef } from '../../shared/activity-types';

interface PhoneActivityProps {
  activity: ActivityHandle;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: ActivityItemRef) => void;
  /** Key of the expanded row. Owned by the app so Back can collapse it. */
  expanded: string | undefined;
  onExpand: (key: string | undefined) => void;
}

function RowIcon({ row }: { row: ActivityRow }) {
  return <span className="ph-aicon">{row.item.kind === 'pr' ? <PrIcon size={18} /> : <IssueIcon size={18} />}</span>;
}

function Row({ row, open, onToggle, onOpen }: { row: ActivityRow; open: boolean; onToggle: () => void; onOpen: () => void }) {
  const { item, latest } = row;
  return (
    <div className={`ph-arow-wrap${open ? ' is-open' : ''}${row.unread ? ' is-unread' : ''}`}>
      <button
        type="button"
        className="ph-arow"
        aria-expanded={open}
        aria-label={`${row.unread ? 'unread, ' : ''}${item.title}, ${rowMeta(item, latest)}`}
        onClick={onToggle}
      >
        {row.unread ? <span className="ph-dot" aria-hidden="true" /> : null}
        <RowIcon row={row} />
        <span className="ph-atitle">
          <span className="ph-atext">{item.title}</span>
          {row.updates > 1 ? <span className="ph-updates">{row.updates} updates</span> : null}
        </span>
        <span className="ph-ameta">{rowMeta(item, latest)}</span>
        <span className="ph-aage">{activityAge(latest.at)}</span>
      </button>
      {open ? (
        <div className="ph-atimeline">
          <ActivityTimeline item={item} events={row.events} />
          <button type="button" className="ph-btn ph-aopen" onClick={onOpen}>
            Open #{item.number}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="ph-askel" key={i}>
          <span className="ph-sk ph-askel-icon" />
          <span className="ph-sk" style={{ width: 180 }} />
          <span className="ph-sk" style={{ width: 150 }} />
        </div>
      ))}
    </div>
  );
}

/** B1 to B7: the item-grouped Activity feed. */
export function PhoneActivity({ activity, refreshing, onRefresh, onOpen, expanded, onExpand }: PhoneActivityProps) {
  const { feed, error, lastVisit } = activity;
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [showMine, setShowMine] = useState(false);

  const view = useMemo(
    () => (feed ? buildActivityView(feed.groups, { viewer: feed.viewer, filter, showMine, lastVisit }) : undefined),
    [feed, filter, showMine, lastVisit],
  );
  const status = activityStatus({ feed, error, view, filter });
  const chips = activityChipViews(status === 'loading' ? undefined : view);
  const syncLine = status === 'loading' ? 'Loading activity…' : activitySyncLine(feed, view);
  const cached = feed !== undefined && error !== undefined;
  const hiddenMine = view?.hiddenMine ?? 0;

  const pick = (k: string) => setFilter((f) => (f === k ? 'all' : (k as ActivityFilter)));

  let body;
  if (status === 'loading') {
    body = <SkeletonRows />;
  } else if (status === 'error') {
    body = (
      <div className="ph-error ph-aerror" role="alert">
        <span className="ph-error-icon">
          <CrossCircleIcon size={32} />
        </span>
        <div className="ph-error-text">
          <h2 className="ph-error-title">Couldn&apos;t load activity</h2>
          <p className="ph-error-body">
            {error}
            <br />
            Showing nothing because no cache exists yet.
          </p>
          <div className="ph-error-actions">
            <button type="button" className="ph-btn" onClick={activity.reload}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  } else if (status === 'empty') {
    body = (
      <div className="ph-empty">
        <span className="ph-empty-ring">
          <CheckCircleIcon size={56} />
        </span>
        <h2 className="ph-empty-title">You&apos;re caught up</h2>
        <p className="ph-empty-body">Nothing has moved since your last visit.</p>
        {hiddenMine > 0 ? (
          <button type="button" className="ph-btn" onClick={() => setShowMine(true)}>
            Show my own ({hiddenMine})
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <>
        {cached ? (
          <div className="ph-error ph-aerror" role="alert">
            <span className="ph-error-icon">
              <CrossCircleIcon size={24} />
            </span>
            <div className="ph-error-text">
              <h2 className="ph-error-title">Couldn&apos;t refresh activity</h2>
              <p className="ph-error-body">
                {error} Showing the cached list from {clock(feed?.syncedAt ?? 0)}.
              </p>
              <div className="ph-error-actions">
                <button type="button" className="ph-btn" onClick={activity.reload}>
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {(view?.rows ?? []).map((row) => {
          const key = groupKey(row.item);
          return (
            <Row
              key={key}
              row={row}
              open={expanded === key}
              onToggle={() => onExpand(expanded === key ? undefined : key)}
              onOpen={() => onOpen(row.item)}
            />
          );
        })}
        {filter !== 'all' && (view?.rows.length ?? 0) === 0 ? <p className="ph-quiet">No matching items.</p> : null}
        {filter !== 'all' ? (
          <p className="ph-quiet ph-ahint">
            {FILTER_HINTS[filter]}
            <br />
            Tap the chip again to clear.
          </p>
        ) : null}
        <p className="ph-quiet ph-afooter">
          {feed?.hasOlder ? (
            <>
              Showing the last {feed.days} days ·{' '}
              <button type="button" className="ph-alink" onClick={activity.loadOlder}>
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
    <>
      <Chips chips={chips} value={filter} onChange={pick} />
      <PullList syncLine={syncLine} refreshing={refreshing} onRefresh={onRefresh}>
        {status === 'ready' || status === 'empty' ? (
          <div className="ph-afilter" role="status">
            {filter !== 'all' ? (
              <span>
                Showing {view?.rows.length ?? 0} of {view?.counts.all ?? 0} ·{' '}
                <button type="button" className="ph-alink" onClick={() => setFilter('all')}>
                  Clear filter
                </button>
              </span>
            ) : (
              <span />
            )}
            <span>
              {showMine ? 'Showing mine' : `Mine hidden (${hiddenMine})`} ·{' '}
              <button type="button" className="ph-alink" onClick={() => setShowMine((s) => !s)}>
                {showMine ? 'Hide' : 'Show'}
              </button>
            </span>
          </div>
        ) : null}
        {body}
      </PullList>
    </>
  );
}
