import { describe, expect, it } from 'vitest';
import {
  CLOSED_PILL,
  closedCount,
  closedDate,
  closedIssueState,
  closedMeta,
  closedPrState,
  closedReducer,
  closedStatusLine,
  emptyLabel,
  initialClosed,
  loadMoreLabel,
  needsLoad,
  nextWindow,
  sectionTitle,
  windowLabel,
  windowStart,
  type ClosedAction,
  type ClosedPage,
  type ClosedSectionState,
} from '../shared/closed';

type Row = { id: string };
const page = (ids: string[], more = false, cursor?: string): ClosedPage<Row> => ({
  items: ids.map((id) => ({ id })),
  hasMore: more,
  ...(cursor ? { cursor } : {}),
});
const run = (s: ClosedSectionState<Row>, ...actions: ClosedAction<Row>[]) => actions.reduce(closedReducer, s);

describe('row state helpers', () => {
  it('tells merged and closed PRs apart', () => {
    expect(closedPrState({ merged: true })).toBe('merged');
    expect(closedPrState({ merged: false })).toBe('closed');
  });

  it('tells completed and not planned issues apart', () => {
    expect(closedIssueState({ closeReason: 'COMPLETED' })).toBe('completed');
    expect(closedIssueState({ closeReason: 'NOT_PLANNED' })).toBe('not-planned');
  });

  it('gives each state its own pill word', () => {
    expect(Object.values(CLOSED_PILL)).toEqual(['MERGED', 'CLOSED', 'COMPLETED', 'NOT PLANNED']);
  });

  it('words the row meta by state', () => {
    expect(closedMeta('acme-dev', 'merged')).toBe('acme-dev · merged');
    expect(closedMeta('acme-dev', 'closed')).toBe('acme-dev · not merged');
    expect(closedMeta('build-bot', 'completed')).toBe('build-bot · completed');
    expect(closedMeta('build-bot', 'not-planned')).toBe('build-bot · not planned');
  });

  it('writes the status line for a merged PR', () => {
    const at = '2026-11-11T12:00:00Z';
    expect(closedDate(at)).toBe('11 Nov 2026');
    expect(closedStatusLine({ merged: true, closedAt: at, mergedBy: 'acme-dev' })).toBe('Merged on 11 Nov 2026 by acme-dev');
    expect(closedStatusLine({ merged: true, closedAt: at })).toBe('Merged on 11 Nov 2026');
  });

  it('writes the status line for a closed PR', () => {
    expect(closedStatusLine({ merged: false, closedAt: '2026-11-11T12:00:00Z' })).toBe('Closed on 11 Nov 2026, not merged');
  });
});

describe('window helpers', () => {
  it('cycles 30 to 90 and back', () => {
    expect(nextWindow(30)).toBe(90);
    expect(nextWindow(90)).toBe(30);
  });

  it('labels the section, control, empty line and load more row by window', () => {
    expect(windowLabel(30)).toBe('Last 30 days');
    expect(sectionTitle(30)).toBe('Closed · last 30 days');
    expect(sectionTitle(90)).toBe('Closed · last 90 days');
    expect(emptyLabel(30)).toBe('Nothing closed in 30 days.');
    expect(loadMoreLabel(30)).toBe('Load more (older than 30 days)');
  });

  it('starts the window that many days back', () => {
    const now = Date.parse('2026-11-12T00:00:00Z');
    expect(new Date(windowStart(now, 30)).toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
});

describe('closed section state', () => {
  const fresh = initialClosed<Row>();

  it('starts collapsed and idle, so nothing loads', () => {
    expect(fresh).toMatchObject({ open: false, status: 'idle', window: 30 });
    expect(needsLoad(fresh)).toBe(false);
  });

  it('asks for its first load when it first opens', () => {
    const opened = run(fresh, { type: 'toggle' });
    expect(needsLoad(opened)).toBe(true);
    expect(closedCount(opened)).toBe('…');
  });

  it('does not load again when it closes and opens', () => {
    const loaded = run(fresh, { type: 'toggle' }, { type: 'start' }, { type: 'loaded', window: 30, append: false, page: page(['a', 'b']) });
    const again = run(loaded, { type: 'toggle' }, { type: 'toggle' });
    expect(needsLoad(again)).toBe(false);
    expect(again.items).toHaveLength(2);
    expect(closedCount(again)).toBe('2');
  });

  it('shows no count before it has loaded', () => {
    expect(closedCount(fresh)).toBe('');
  });

  it('counts zero for an empty window', () => {
    const empty = run(fresh, { type: 'toggle' }, { type: 'start' }, { type: 'loaded', window: 30, append: false, page: page([]) });
    expect(closedCount(empty)).toBe('0');
    expect(empty.status).toBe('ready');
  });

  it('keeps the cursor and appends the next page', () => {
    const s = run(
      fresh,
      { type: 'toggle' },
      { type: 'start' },
      { type: 'loaded', window: 30, append: false, page: page(['a'], true, 'C1') },
      { type: 'more' },
    );
    expect(s).toMatchObject({ more: true, cursor: 'C1', hasMore: true });
    const next = run(s, { type: 'loaded', window: 30, append: true, page: page(['b'], false) });
    expect(next.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(next).toMatchObject({ more: false, hasMore: false, cursor: undefined });
  });

  it('reloads when the window changes and stays open', () => {
    const loaded = run(fresh, { type: 'toggle' }, { type: 'start' }, { type: 'loaded', window: 30, append: false, page: page(['a']) });
    const changed = run(loaded, { type: 'window', window: 90 });
    expect(changed).toMatchObject({ open: true, window: 90, status: 'idle', items: [] });
    expect(needsLoad(changed)).toBe(true);
  });

  it('ignores a window action that changes nothing', () => {
    const loaded = run(fresh, { type: 'toggle' }, { type: 'start' }, { type: 'loaded', window: 30, append: false, page: page(['a']) });
    expect(run(loaded, { type: 'window', window: 30 })).toBe(loaded);
  });

  it('drops a reply for a window that is no longer current', () => {
    const waiting = run(fresh, { type: 'toggle' }, { type: 'start' }, { type: 'window', window: 90 });
    const late = run(waiting, { type: 'loaded', window: 30, append: false, page: page(['stale']) });
    expect(late.items).toEqual([]);
    expect(late.status).toBe('idle');
  });

  it('shows an error for a failed first load and retries it', () => {
    const failed = run(fresh, { type: 'toggle' }, { type: 'start' }, { type: 'failed', window: 30, append: false, error: 'boom' });
    expect(failed).toMatchObject({ status: 'error', error: 'boom' });
    const retried = run(failed, { type: 'retry' });
    expect(needsLoad(retried)).toBe(true);
    expect(retried.error).toBeUndefined();
  });

  it('keeps the rows when only a Load more fails', () => {
    const s = run(
      fresh,
      { type: 'toggle' },
      { type: 'start' },
      { type: 'loaded', window: 30, append: false, page: page(['a'], true, 'C1') },
      { type: 'more' },
      { type: 'failed', window: 30, append: true, error: 'boom' },
    );
    expect(s).toMatchObject({ status: 'ready', more: false, error: 'boom' });
    expect(s.items).toHaveLength(1);
  });
});
