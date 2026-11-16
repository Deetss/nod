import { describe, expect, it } from 'vitest';
import {
  BAR_SHOWN,
  barStep,
  doneText,
  filterBadge,
  filterButtonLabel,
  flatResults,
  resultsLine,
  sectionShown,
  shownTotal,
  toggleFilter,
  type BarScroll,
} from '../web/phone/bottom-search';
import { issueChips } from '../web/phone/phone-logic';
import type { IssueSection } from '../shared/issue-types';

describe('filter set', () => {
  it('toggles a key on and off without changing the old set', () => {
    const empty = new Set<string>();
    const one = toggleFilter(empty, 'needs');
    expect([...one]).toEqual(['needs']);
    expect(empty.size).toBe(0);
    expect(toggleFilter(one, 'needs').size).toBe(0);
  });

  it('shows every section with nothing ticked and only ticked ones otherwise', () => {
    expect(sectionShown(new Set(), 'org')).toBe(true);
    expect(sectionShown(new Set(['needs', 'mine']), 'mine')).toBe(true);
    expect(sectionShown(new Set(['needs', 'mine']), 'org')).toBe(false);
  });
});

describe('filter button text', () => {
  it('has no badge at 0, the number from 1 to 9, and 9+ from 10', () => {
    expect(filterBadge(0)).toBeUndefined();
    expect(filterBadge(1)).toBe('1');
    expect(filterBadge(9)).toBe('9');
    expect(filterBadge(10)).toBe('9+');
  });

  it('carries the count in the button label', () => {
    expect(filterButtonLabel(0)).toBe('Filters');
    expect(filterButtonLabel(2)).toBe('Filters, 2 on');
  });

  it('counts filters on Done', () => {
    expect(doneText(0)).toBe('Done');
    expect(doneText(1)).toBe('Done · 1 filter');
    expect(doneText(2)).toBe('Done · 2 filters');
  });
});

describe('issue filter rows', () => {
  it('puts the bot section last, after the five fixed sections', () => {
    const sec = (key: IssueSection['key'], title: string = key): IssueSection => ({ key, title, count: 1, issues: [] });
    const rows = issueChips([sec('progress'), sec('bot', 'With review-bot'), sec('assigned'), sec('all')]);
    expect(rows.map((r) => r.label)).toEqual(['All', 'In progress', 'Assigned', 'With review-bot']);
  });
});

describe('search results', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('lists each item once, in section order', () => {
    expect(flatResults([{ items: [a, b] }, { items: [b, c] }])).toEqual([a, b, c]);
    expect(shownTotal([{ items: [a, b] }, { items: [b, c] }])).toBe(3);
  });

  it('names the query and the ticked filters', () => {
    expect(resultsLine(6, ' webhook ', [])).toBe('6 results for “webhook”');
    expect(resultsLine(1, 'webhook', [])).toBe('1 result for “webhook”');
    expect(resultsLine(6, 'webhook', ['Needs me', 'Mine'])).toBe('6 results for “webhook” · Needs me, Mine');
    expect(resultsLine(0, 'xyz', [])).toBe('No results for “xyz”');
  });
});

describe('barStep', () => {
  const run = (tops: number[], from: BarScroll = BAR_SHOWN) => tops.reduce(barStep, from);

  it('stays shown inside the header collapse range', () => {
    expect(run([10, 30, 56]).hidden).toBe(false);
  });

  it('hides after 24px down past the collapse range', () => {
    expect(run([56, 79]).hidden).toBe(false);
    expect(run([56, 79, 80]).hidden).toBe(true);
  });

  it('shows again on 8px up, and not on less', () => {
    const hidden = run([56, 100, 200]);
    expect(hidden.hidden).toBe(true);
    expect(barStep(hidden, 195).hidden).toBe(true);
    expect(barStep(barStep(hidden, 195), 192).hidden).toBe(false);
  });

  it('measures the 24px from the last change of direction', () => {
    const s = run([56, 200, 150, 170]);
    expect(s.hidden).toBe(false);
    expect(barStep(s, 175).hidden).toBe(true);
  });

  it('shows at the top whatever came before', () => {
    expect(run([56, 300, 40]).hidden).toBe(false);
  });
});
