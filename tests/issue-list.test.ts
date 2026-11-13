// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { IssueInboxData, IssueSummary } from '../shared/issue-types';
import {
  DEFAULT_ISSUE_FILTER,
  buildIssueSections,
  issueWalkOrder,
  matchesIssue,
  sortIssues,
  type IssueFilter,
} from '../web/issues/issue-filter';

function issue(over: Partial<IssueSummary> & { id: string }): IssueSummary {
  return {
    repo: 'acme-api',
    number: 1,
    title: 't',
    author: 'build-bot',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    url: 'u',
    state: 'open',
    labels: [{ name: 'bug', color: 'd73a4a' }],
    assignees: [],
    commentCount: 0,
    seen: 'seen',
    ...over,
  };
}

const ISSUES: IssueSummary[] = [
  issue({ id: 'a', repo: 'acme-api', title: 'Export drops column', updatedAt: '2026-11-06T09:00:00Z', commentCount: 1, createdAt: '2026-11-01T00:00:00Z' }),
  issue({ id: 'b', repo: 'acme-banner', author: 'acme-dev', title: 'Timeout', labels: [], updatedAt: '2026-11-06T12:00:00Z', commentCount: 4, createdAt: '2026-11-05T00:00:00Z' }),
  issue({ id: 'c', repo: 'acme-api', labels: [{ name: 'security', color: 'b60205' }], updatedAt: '2026-11-06T11:00:00Z', commentCount: 0, createdAt: '2026-11-03T00:00:00Z', assignees: ['acme-dev'] }),
];

const DATA: IssueInboxData = { viewer: 'acme-dev', issues: ISSUES, mentionedIds: ['c'], syncedAt: 0 };

const f = (over: Partial<IssueFilter>): IssueFilter => ({ ...DEFAULT_ISSUE_FILTER, ...over });

describe('matchesIssue', () => {
  it('passes everything under the default filter', () => {
    expect(ISSUES.every((i) => matchesIssue(i, DEFAULT_ISSUE_FILTER))).toBe(true);
  });

  it('filters by repo and label', () => {
    expect(ISSUES.filter((i) => matchesIssue(i, f({ repo: 'acme-api' }))).map((i) => i.id)).toEqual(['a', 'c']);
    expect(ISSUES.filter((i) => matchesIssue(i, f({ label: 'security' }))).map((i) => i.id)).toEqual(['c']);
  });

  it('matches text against repo, author, title and label names, case-insensitively', () => {
    expect(matchesIssue(ISSUES[0]!, f({ text: 'EXPORT' }))).toBe(true);
    expect(matchesIssue(ISSUES[1]!, f({ text: 'acme-dev' }))).toBe(true);
    expect(matchesIssue(ISSUES[1]!, f({ text: 'acme-banner' }))).toBe(true);
    expect(matchesIssue(ISSUES[2]!, f({ text: 'security' }))).toBe(true);
    expect(matchesIssue(ISSUES[0]!, f({ text: 'nope' }))).toBe(false);
  });
});

describe('sortIssues', () => {
  it('sorts newest update first by default', () => {
    expect(sortIssues(ISSUES, 'updated').map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by creation date and by comment count, most first', () => {
    expect(sortIssues(ISSUES, 'created').map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(sortIssues(ISSUES, 'comments').map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate its input', () => {
    const before = ISSUES.map((i) => i.id);
    sortIssues(ISSUES, 'comments');
    expect(ISSUES.map((i) => i.id)).toEqual(before);
  });
});

describe('buildIssueSections', () => {
  it('applies the filter and sort inside each section, and reports counts after filtering', () => {
    const sections = buildIssueSections(DATA, f({ repo: 'acme-api', sort: 'comments' }), new Set(['all']));
    const byKey = Object.fromEntries(sections.map((s) => [s.key, s]));
    expect(byKey.assigned?.issues.map((i) => i.id)).toEqual(['c']);
    // c mentions the viewer but is already in Assigned, so Mentioned stays empty.
    expect(byKey.mentioned?.count).toBe(0);
    expect(byKey.all?.open).toBe(false);
    expect(byKey.untriaged?.count).toBe(0);
    expect(byKey.all?.count).toBe(2);
  });

  it('walks only open sections and lists each issue once', () => {
    // Nothing collapsed: All open repeats every issue, and the walk lists each once.
    const open = buildIssueSections(DATA, DEFAULT_ISSUE_FILTER, new Set());
    expect(issueWalkOrder(open)).toEqual(['c', 'b', 'a']);
    // With All open collapsed, its issues drop out of the walk; only the repeats remain.
    const closed = buildIssueSections(DATA, DEFAULT_ISSUE_FILTER, new Set(['all']));
    expect(issueWalkOrder(closed)).toEqual(['c', 'b']);
  });
});
