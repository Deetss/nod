import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckVerdict, IssueComment } from '../shared/issue-types';
import { actionItems, type ActionContext } from '../web/phone/action-items';
import { phoneBotState, type PhoneBotState } from '../web/phone/bot-check-phone';
import type { CheckFlowState, TrimFlowState } from '../shared/bot';
import { setOrgSettings } from '../web/org-settings';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { TEST_BOT, TEST_SETTINGS } from './bot-settings';

const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({
  target: 'issue',
  ownPr: false,
  isAdmin: false,
  adminReady: false,
  orcaAvailable: true,
  issueOpen: true,
  assignedToViewer: false,
  writesOff: false,
  repo: 'acme-web',
  ...over,
});

const verdictOf = (verdict: CheckVerdict, met?: number[]): IssueComment[] => [
  {
    id: 'v1',
    author: 'build-bot',
    createdAt: new Date(2026, 10, 12, 23, 0).toISOString(),
    bodyHtml: '<p>x</p>',
    bot: { kind: 'check', verdict, ...(met ? { met } : {}) },
  },
];

const botState = (check: CheckFlowState, trim: TrimFlowState, comments: IssueComment[] = []): PhoneBotState =>
  phoneBotState(check, trim, comments);

const ids = (c: ActionContext) => actionItems(c).map((i) => i.id);
const find = (c: ActionContext, id: string) => actionItems(c).find((i) => i.id === id);

beforeEach(() => setOrgSettings(TEST_SETTINGS));
afterEach(() => setOrgSettings(DEFAULT_SETTINGS));

describe('bot check rows', () => {
  it('shows Check with the bot name when no verdict exists', () => {
    const c = ctx({ botState: botState('idle', 'hidden') });
    expect(find(c, 'bot-check')).toMatchObject({ label: `Check with ${TEST_BOT.name}` });
    expect(find(c, 'bot-trim')).toBeUndefined();
  });

  it('shows Check again once a verdict exists', () => {
    const c = ctx({ botState: botState('verdict', 'hidden', verdictOf('valid')) });
    expect(find(c, 'bot-check')?.label).toBe('Check again');
  });

  it('shows Checking... and disables the row while pending', () => {
    const c = ctx({ botState: botState('pending', 'hidden') });
    expect(find(c, 'bot-check')).toMatchObject({ label: 'Checking...', dashed: true });
    expect(find(c, 'bot-check')?.disabled).toBeDefined();
  });

  it('shows no check rows while the bot is off', () => {
    setOrgSettings({ ...TEST_SETTINGS, bot: { ...TEST_BOT, enabled: false } });
    const c = ctx({ botState: botState('hidden', 'hidden') });
    expect(ids(c)).not.toContain('bot-check');
    expect(ids(c)).not.toContain('bot-trim');
  });

  it('shows no check rows when the bot state is absent', () => {
    expect(ids(ctx())).not.toContain('bot-check');
  });

  it('offers Trim with its count on partly with met criteria', () => {
    const c = ctx({ botState: botState('verdict', 'offered', verdictOf('partly', [1, 3])) });
    expect(find(c, 'bot-trim')).toMatchObject({ label: 'Trim met criteria (2)' });
    expect(ids(c).indexOf('bot-trim')).toBeLessThan(ids(c).indexOf('bot-check'));
  });

  it('shows Trimming... disabled while the trim is pending', () => {
    const c = ctx({ botState: botState('verdict', 'pending', verdictOf('partly', [1])) });
    expect(find(c, 'bot-trim')).toMatchObject({ label: 'Trimming...', dashed: true });
  });

  it('offers no Trim without met criteria', () => {
    const c = ctx({ botState: botState('verdict', 'hidden', verdictOf('partly')) });
    expect(ids(c)).not.toContain('bot-trim');
  });
});

describe('verdict follow-up emphasis', () => {
  it('emphasises Close as completed on done', () => {
    const c = ctx({ botState: botState('verdict', 'hidden', verdictOf('done')) });
    expect(find(c, 'close-completed')?.emphasis).toBe('primary');
    expect(find(c, 'close-not-planned')?.emphasis).toBeUndefined();
  });

  it('emphasises Not planned on obsolete', () => {
    const c = ctx({ botState: botState('verdict', 'hidden', verdictOf('obsolete')) });
    expect(find(c, 'close-not-planned')?.emphasis).toBe('neutral');
    expect(find(c, 'close-completed')?.emphasis).toBeUndefined();
  });

  it('emphasises Hand to the bot on valid, unless the label is set', () => {
    const c = ctx({ botState: botState('verdict', 'hidden', verdictOf('valid')) });
    expect(find(c, 'hand-bot')?.emphasis).toBe('primary');
    const held = ctx({ withBot: true, botState: botState('verdict', 'hidden', verdictOf('valid')) });
    expect(find(held, 'hand-bot')?.emphasis).toBeUndefined();
  });

  it('emphasises nothing on unclear', () => {
    const c = ctx({ botState: botState('verdict', 'hidden', verdictOf('unclear')) });
    expect(actionItems(c).filter((i) => i.emphasis)).toEqual([]);
  });

  it('emphasises nothing while idle or pending', () => {
    expect(actionItems(ctx({ botState: botState('idle', 'hidden') })).filter((i) => i.emphasis)).toEqual([]);
    expect(actionItems(ctx({ botState: botState('pending', 'hidden') })).filter((i) => i.emphasis)).toEqual([]);
  });
});
