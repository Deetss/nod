// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import type { PrSummary } from '../shared/types';
import { SEEN_DWELL_MS, useSeenOnView } from '../web/useSeenOnView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function pr(id: string, extra: Partial<PrSummary> = {}): PrSummary {
  return { id, repo: 'acme/acme-web', number: 1355, updatedAt: '2026-11-10T10:00:00Z', headSha: 'a1', ...extra } as PrSummary;
}

let root: Root | undefined;
let host: HTMLDivElement;

function Probe(props: { pr?: PrSummary; onSeen: (p: PrSummary) => void }) {
  useSeenOnView(props.pr, props.onSeen);
  return null;
}

function mount(pr: PrSummary | undefined, onSeen: (p: PrSummary) => void) {
  act(() => root!.render(createElement(Probe, { pr, onSeen })));
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useSeenOnView', () => {
  it('marks the selected PR after the dwell', () => {
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS - 1));
    expect(onSeen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(onSeen).toHaveBeenCalledWith(pr('p1'));
  });

  it('cancels the mark when the selection changes before the dwell ends', () => {
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS - 500));
    mount(pr('p2'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS * 2));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(onSeen).toHaveBeenCalledWith(pr('p2'));
  });

  it('cancels the mark when the detail is cleared', () => {
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    mount(undefined, onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS * 2));
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('marks again when updatedAt changes while the PR stays selected', () => {
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    expect(onSeen).toHaveBeenCalledTimes(1);

    const later = pr('p1', { updatedAt: '2026-11-10T10:05:00Z' });
    mount(later, onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    expect(onSeen).toHaveBeenCalledTimes(2);
    expect(onSeen).toHaveBeenLastCalledWith(later);
  });

  it('marks again when headSha changes while the PR stays selected', () => {
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    mount(pr('p1', { headSha: 'b2' }), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    expect(onSeen).toHaveBeenCalledTimes(2);
  });

  it('does not mark while the document is hidden', () => {
    setVisibility('hidden');
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS * 4));
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('marks once the document becomes visible while still selected', () => {
    setVisibility('hidden');
    const onSeen = vi.fn();
    mount(pr('p1'), onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS * 2));
    setVisibility('visible');
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    expect(onSeen).toHaveBeenCalledTimes(1);
  });
});

describe('useSeenOnView with an issue', () => {
  type Issue = Pick<IssueSummary, 'id' | 'updatedAt' | 'commentCount'>;

  function IssueProbe(props: { issue?: Issue; onSeen: (i: Issue) => void }) {
    useSeenOnView(props.issue, props.onSeen);
    return null;
  }

  const show = (issue: Issue | undefined, onSeen: (i: Issue) => void) =>
    act(() => root!.render(createElement(IssueProbe, { issue, onSeen })));

  it('marks an issue that has no headSha, and again after it updates', () => {
    const onSeen = vi.fn();
    const issue = { id: 'i1', updatedAt: '2026-11-10T10:00:00Z', commentCount: 2 };
    show(issue, onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    expect(onSeen).toHaveBeenCalledWith(issue);
    show({ ...issue, updatedAt: '2026-11-10T11:00:00Z' }, onSeen);
    act(() => vi.advanceTimersByTime(SEEN_DWELL_MS));
    expect(onSeen).toHaveBeenCalledTimes(2);
  });
});
