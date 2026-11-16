// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffLine } from '../shared/types';
import { HunkLines } from '../web/DiffFileView';
import type { ComposerState } from '../web/inline/composer-state';
import type { GroupedThread } from '../web/inline/group-threads';
import { actionItems, type ActionContext } from '../web/phone/action-items';
import { PhoneCommentSheet } from '../web/phone/PhoneCommentSheet';
import { PhoneFinishReview } from '../web/phone/PhoneFinishReview';
import { commentTitle, threadPillLabel, usePhoneComments, type PhoneComments } from '../web/phone/usePhoneComments';

const review = vi.hoisted(() => vi.fn(async () => ({ ok: true, message: 'ok' })));
vi.mock('../web/api', () => ({ api: { review } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  review.mockClear();
});

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe('usePhoneComments', () => {
  let flow: PhoneComments | undefined;
  function Probe() {
    flow = usePhoneComments({ repo: 'acme-co/acme-api', number: 310 }, () => undefined);
    return null;
  }

  it('selects a line, extends it on the same side, and clears on the anchor', () => {
    render(createElement(Probe));
    act(() => flow?.tap('a.rb', { side: 'RIGHT', line: 20 }));
    expect(flow?.state.target).toMatchObject({ subject: 'line', line: 20 });
    expect(flow?.state.target && commentTitle(flow.state.target)).toBe('Comment on line 20');

    act(() => flow?.tap('a.rb', { side: 'RIGHT', line: 22 }));
    expect(flow?.state.target && commentTitle(flow.state.target)).toBe('Comment on lines 20–22');

    act(() => flow?.tap('a.rb', { side: 'RIGHT', line: 20 }));
    act(() => flow?.tap('a.rb', { side: 'RIGHT', line: 20 }));
    expect(flow?.state.status).toBe('closed');
  });

  it('starts over on the other side or another file', () => {
    render(createElement(Probe));
    act(() => flow?.tap('a.rb', { side: 'RIGHT', line: 20 }));
    act(() => flow?.tap('a.rb', { side: 'LEFT', line: 19 }));
    expect(flow?.state.target).toMatchObject({ side: 'LEFT', line: 19 });
    act(() => flow?.tap('b.rb', { side: 'LEFT', line: 3 }));
    expect(flow?.state.target).toMatchObject({ path: 'b.rb', line: 3 });
  });

  it('titles a file comment by its name', () => {
    expect(commentTitle({ subject: 'file', path: 'app/models/unit_sale.rb' })).toBe('Comment on unit_sale.rb');
  });
});

describe('threadPillLabel', () => {
  const g = (authors: string[], resolved = false): GroupedThread => ({
    thread: { comments: authors.map((author) => ({ author })) } as unknown as GroupedThread['thread'],
    draft: false,
    resolved,
    outdated: false,
  });
  it('counts comments and names the first author, or says Resolved', () => {
    expect(threadPillLabel(g(['riley-k', 'sam-lee']))).toBe('2 comments · riley-k');
    expect(threadPillLabel(g(['build-bot']))).toBe('1 comment · build-bot');
    expect(threadPillLabel(g(['riley-k'], true))).toBe('1 comment · Resolved');
  });
});

describe('range highlight', () => {
  const lines: DiffLine[] = [
    { kind: 'ctx', oldNo: 19, newNo: 19, text: 'a' },
    { kind: 'add', newNo: 20, text: 'b' },
    { kind: 'add', newNo: 21, text: 'c' },
    { kind: 'add', newNo: 22, text: 'd' },
  ];
  it('marks every row of the open range when showRange is on', () => {
    const state: ComposerState = { status: 'open', text: '', drafts: {}, target: { subject: 'line', path: 'a.rb', side: 'RIGHT', anchor: 20, startLine: 20, line: 21 } };
    const el = render(
      createElement(HunkLines, {
        lines,
        yaml: false,
        comment: { state, onOpenLine: () => undefined, onOpenFile: () => undefined, renderComposer: () => null, showRange: true },
      }),
    );
    const marked = [...el.querySelectorAll('.dl')].map((r) => r.classList.contains('dl-cursor'));
    expect(marked).toEqual([false, true, true, false]);
  });
});

describe('PhoneCommentSheet', () => {
  const base: ComposerState = { status: 'open', text: '', drafts: {}, target: { subject: 'line', path: 'a.rb', side: 'RIGHT', anchor: 13, line: 13 } };
  const sheet = (state: ComposerState, onSubmit = vi.fn()) =>
    render(createElement(PhoneCommentSheet, { state, sub: 'a.rb', onText: () => undefined, onSubmit, onCancel: () => undefined }));

  it('keeps both submits off until there is text, then posts or drafts', () => {
    expect(button(sheet(base), 'Add to review').disabled).toBe(true);
    act(() => root?.unmount());
    const onSubmit = vi.fn();
    const el = sheet({ ...base, text: 'Guard it' }, onSubmit);
    act(() => button(el, 'Add to review').click());
    act(() => button(el, 'Comment').click());
    expect(onSubmit.mock.calls).toEqual([[true], [false]]);
  });

  it('shows the error and Retry after a failed post, keeping the text', () => {
    const el = sheet({ ...base, status: 'failed', text: 'Guard it', error: 'GitHub returned 422' });
    expect(el.textContent).toContain('Not posted: GitHub returned 422');
    expect(button(el, 'Retry')).toBeTruthy();
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Guard it');
  });
});

describe('PhoneFinishReview', () => {
  const finish = (ownPr: boolean, onDone = vi.fn()) =>
    render(createElement(PhoneFinishReview, { repo: 'acme-co/acme-api', number: 310, drafts: 2, ownPr, onDone, onCancel: () => undefined }));
  const option = (el: HTMLElement, title: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('.ph-finish-option')].find((b) => b.textContent?.startsWith(title)) as HTMLButtonElement;

  it('starts on Comment and allows only Comment on your own PR', () => {
    const el = finish(true);
    expect(option(el, 'Comment').getAttribute('aria-checked')).toBe('true');
    expect(option(el, 'Approve').disabled).toBe(true);
    expect(option(el, 'Request changes').disabled).toBe(true);
  });

  it('needs a summary for Request changes, then submits the event with it', async () => {
    const onDone = vi.fn();
    const el = finish(false, onDone);
    act(() => option(el, 'Request changes').click());
    expect(button(el, 'Submit review').disabled).toBe(true);

    const area = el.querySelector<HTMLTextAreaElement>('.ph-finish-body')!;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      set.call(area, 'Keep :all for admins');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(el, 'Submit review').click());
    expect(review).toHaveBeenCalledWith('acme-co/acme-api', 310, 'REQUEST_CHANGES', 'Keep :all for admins');
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe('Comment on file row', () => {
  const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({
    target: 'pr',
    ownPr: false,
    isAdmin: false,
    adminReady: false,
    orcaAvailable: false,
    issueOpen: true,
    assignedToViewer: false,
    writesOff: false,
    ...over,
  });

  it('leads the PR menu when it was opened from a diff', () => {
    expect(actionItems(ctx({ commentFile: 'unit_sale.rb' }))[0]).toMatchObject({ id: 'comment-file', label: 'Comment on file', sub: 'unit_sale.rb' });
    expect(actionItems(ctx()).some((i) => i.id === 'comment-file')).toBe(false);
  });
});
