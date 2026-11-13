import { describe, expect, it } from 'vitest';
import {
  actionItems,
  approveDisabled,
  issuePrimary,
  OWN_PR_HINT,
  type ActionContext,
} from '../web/phone/action-items';
import { depthAfterBack, stackReducer, topLevel, type Level } from '../web/phone/sheet-stack';

const pr: Level = { kind: 'pr', id: 'PR_1' };
const diff: Level = { kind: 'diff', path: 'a.rb' };
const actions: Level = { kind: 'actions' };
const confirm: Level = { kind: 'confirm', action: 'admin-merge' };

describe('sheet stack', () => {
  it('stacks sheets over the root', () => {
    let s = stackReducer([], { type: 'push', level: pr });
    s = stackReducer(s, { type: 'push', level: diff });
    s = stackReducer(s, { type: 'push', level: actions });
    expect(s).toEqual([pr, diff, actions]);
    expect(topLevel(s)).toBe(actions);
  });

  it('pop closes one level and never goes below empty', () => {
    let s: readonly Level[] = [pr, diff];
    s = stackReducer(s, { type: 'pop' });
    expect(s).toEqual([pr]);
    s = stackReducer(s, { type: 'pop' });
    s = stackReducer(s, { type: 'pop' });
    expect(s).toEqual([]);
  });

  it('a new root replaces the stack', () => {
    const s = stackReducer([pr, diff], { type: 'push', level: { kind: 'issue', id: 'I_1' } });
    expect(s).toEqual([{ kind: 'issue', id: 'I_1' }]);
  });

  it('replaceAll leaves one root', () => {
    const next: Level = { kind: 'issue', id: 'I_2' };
    expect(stackReducer([pr, diff, actions], { type: 'replaceAll', level: next })).toEqual([next]);
  });

  it('replaceTop swaps the file without adding a level', () => {
    const next: Level = { kind: 'diff', path: 'b.rb' };
    expect(stackReducer([pr, diff], { type: 'replaceTop', level: next })).toEqual([pr, next]);
    expect(stackReducer([], { type: 'replaceTop', level: next })).toEqual([]);
  });

  it('back closes dialog, then action sheet, then diff, then PR', () => {
    let s: readonly Level[] = [pr, diff, actions, confirm];
    const order: number[] = [];
    for (const depth of [3, 2, 1, 0]) {
      s = stackReducer(s, { type: 'truncate', to: depth });
      order.push(s.length);
    }
    expect(order).toEqual([3, 2, 1, 0]);
  });

  it('truncate never grows the stack (forward navigation is ignored)', () => {
    const s: readonly Level[] = [pr];
    expect(stackReducer(s, { type: 'truncate', to: 3 })).toBe(s);
  });

  it('reads the history depth, defaulting to zero', () => {
    expect(depthAfterBack({ phDepth: 2 })).toBe(2);
    expect(depthAfterBack(null)).toBe(0);
    expect(depthAfterBack({ phDepth: 'x' })).toBe(0);
  });
});

const base: ActionContext = {
  target: 'pr',
  ownPr: false,
  isAdmin: false,
  adminReady: true,
  orcaAvailable: false,
  issueOpen: true,
  assignedToViewer: false,
  writesOff: false,
};
const ids = (c: Partial<ActionContext>) => actionItems({ ...base, ...c }).map((i) => i.id);

describe('action sheet rules, PR', () => {
  it('lists the basics for someone else PR', () => {
    expect(ids({})).toEqual(['request-changes', 'auto-merge', 'comment', 'open-github', 'copy-link']);
  });

  it('own PR disables request changes with the hint', () => {
    const item = actionItems({ ...base, ownPr: true }).find((i) => i.id === 'request-changes');
    expect(item?.disabled).toBe(OWN_PR_HINT);
    expect(approveDisabled({ ownPr: true, writesOff: false })).toBe(OWN_PR_HINT);
    expect(approveDisabled({ ownPr: false, writesOff: false })).toBeUndefined();
  });

  it('admin merge needs admin permission and a confirm', () => {
    expect(ids({})).not.toContain('admin-merge');
    const item = actionItems({ ...base, isAdmin: true }).find((i) => i.id === 'admin-merge');
    expect(item?.confirm).toBe(true);
    expect(item?.disabled).toBeUndefined();
  });

  it('admin merge row is disabled while checks are pending', () => {
    const item = actionItems({ ...base, isAdmin: true, adminReady: false }).find((i) => i.id === 'admin-merge');
    expect(item?.disabled).toBe('Waiting for checks');
  });

  it('a draft explains the merge rows and offers Ready for review to its author', () => {
    const own = { ownPr: true, isAdmin: true, adminReady: false, draft: true };
    const items = actionItems({ ...base, ...own });
    expect(items.find((i) => i.id === 'admin-merge')?.disabled).toBe('Draft: mark ready first');
    expect(items.find((i) => i.id === 'auto-merge')?.disabled).toBe('Draft: mark ready first');
    expect(items.find((i) => i.id === 'ready')?.confirm).toBe(true);
    expect(ids({ draft: true })).not.toContain('ready');
    expect(ids({ ...own, draft: false })).not.toContain('ready');
  });

  it('dispatch shows only when Orca is available, with a confirm', () => {
    expect(ids({})).not.toContain('dispatch');
    const item = actionItems({ ...base, orcaAvailable: true }).find((i) => i.id === 'dispatch');
    expect(item?.confirm).toBe(true);
  });

  it('PRs never list Start work or statuses, even with the project on', () => {
    const list = ids({ projectStatus: true });
    expect(list).not.toContain('start-work');
    expect(list.some((i) => i.startsWith('status:'))).toBe(false);
  });

  it('offline disables writes but keeps Open on GitHub live', () => {
    const items = actionItems({ ...base, writesOff: true });
    for (const i of items) expect(i.disabled !== undefined).toBe(i.id !== 'open-github' && i.id !== 'copy-link');
  });
});

describe('action sheet rules, issue', () => {
  const issue = { target: 'issue' as const };

  it('with the project on, Start work sets In progress and lists all five statuses', () => {
    const on = { ...issue, projectStatus: true };
    expect(ids(on)).toEqual([
      'start-work',
      'edit-title',
      'hand-bot',
      'assign-me',
      'comment',
      'new-issue',
      'close-completed',
      'close-not-planned',
      'status:Backlog',
      'status:Ready',
      'status:In progress',
      'status:In review',
      'status:Done',
      'copy-link',
    ]);
    const start = actionItems({ ...base, ...on, assignedToViewer: true }).find((i) => i.id === 'start-work');
    expect(start?.sub).toBe('Assigns you, sets In progress');
  });

  it('with the project on and In progress, Start work becomes Stop work and the current status is off', () => {
    const items = actionItems({ ...base, ...issue, projectStatus: true, status: 'In progress' });
    expect(items[0]?.id).toBe('stop-work');
    expect(items.find((i) => i.id === 'start-work')).toBeUndefined();
    expect(items.find((i) => i.id === 'status:In progress')?.disabled).toBe('Current');
    expect(issuePrimary({ issueOpen: true, assignedToViewer: false, projectStatus: true, status: 'In progress' }).id).toBe(
      'mark-done',
    );
  });

  it('with the project off, no status rows and Start work only assigns', () => {
    expect(ids(issue).some((i) => i.startsWith('status:'))).toBe(false);
    expect(issuePrimary({ issueOpen: true, assignedToViewer: false }).id).toBe('start-work');
  });

  it('open issue offers start work, assign me, comment and both closes', () => {
    expect(ids(issue)).toEqual([
      'start-work',
      'edit-title',
      'hand-bot',
      'assign-me',
      'comment',
      'new-issue',
      'close-completed',
      'close-not-planned',
      'copy-link',
    ]);
  });

  it('closed issue offers reopen and no close rows', () => {
    expect(ids({ ...issue, issueOpen: false })).toEqual([
      'reopen',
      'edit-title',
      'hand-bot',
      'assign-me',
      'comment',
      'new-issue',
      'copy-link',
    ]);
  });

  it('hides assign me and start work once assigned', () => {
    const got = ids({ ...issue, assignedToViewer: true });
    expect(got).not.toContain('assign-me');
    expect(got).not.toContain('start-work');
  });

  it('bar button follows issue state', () => {
    expect(issuePrimary({ issueOpen: true, assignedToViewer: false }).id).toBe('start-work');
    expect(issuePrimary({ issueOpen: true, assignedToViewer: true }).id).toBe('mark-done');
    expect(issuePrimary({ issueOpen: false, assignedToViewer: true }).id).toBe('reopen');
  });

  it('puts dispatch after Edit title when Orca is available', () => {
    expect(ids({ ...issue, orcaAvailable: true }).slice(0, 3)).toEqual(['start-work', 'edit-title', 'dispatch']);
  });

  it('ignores PR-only rules', () => {
    expect(ids({ ...issue, ownPr: true, isAdmin: true })).not.toContain('admin-merge');
  });
});
