// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import { ActionsPanel } from '../web/issues/IssueSidebar';
import { keepIfSame, resolveEffective } from '../web/issues/stable';

const issue = (id: string, number: number): IssueSummary =>
  ({ id, repo: 'acme-api', number, title: id }) as IssueSummary;

describe('keepIfSame', () => {
  it('keeps the old reference when content is equal', () => {
    const prev = { issues: [{ id: 'a' }], syncedAt: 1 };
    expect(keepIfSame(prev, { issues: [{ id: 'a' }], syncedAt: 1 })).toBe(prev);
  });

  it('takes the new value when content differs', () => {
    const next = { issues: [{ id: 'b' }] };
    expect(keepIfSame({ issues: [{ id: 'a' }] }, next)).toBe(next);
  });
});

describe('resolveEffective', () => {
  const a = issue('A', 1);
  const b = issue('B', 2);

  it('keeps showing the pinned issue when a poll reorders the list', () => {
    expect(resolveEffective(undefined, 'A', [b, a], b)?.id).toBe('A');
  });

  it('falls back to the first issue when the pinned one is gone', () => {
    expect(resolveEffective(undefined, 'A', [b], b)?.id).toBe('B');
  });

  it('prefers an explicit selection', () => {
    const sel = { id: 'B', repo: 'acme-api', number: 2 };
    expect(resolveEffective(sel, 'A', [a, b], a)).toBe(sel);
  });
});

describe('dispatch slot', () => {
  const props = { disabled: false, closed: false, onComment() {}, onEditTitle() {}, onClose() {}, onReopen() {}, onNew() {} };
  const html = (dispatch?: { pending?: boolean; reason?: string; onClick: () => void }) =>
    renderToStaticMarkup(createElement(ActionsPanel, { ...props, dispatch, bot: { held: false, onClick() {} } }));

  it('renders the Orca button, disabled, while availability loads', () => {
    const out = html({ pending: true, onClick() {} });
    expect(out).toMatch(/<button[^>]*disabled[^>]*>\s*Dispatch with Orca/);
  });

  it('adds no extra reason text beside the buttons', () => {
    expect(html({ reason: 'repo not in Orca', onClick() {} })).not.toContain('<span class="muted small">repo not in Orca');
  });
});
