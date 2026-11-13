import { describe, expect, it } from 'vitest';
import {
  AUTO_PREFIX,
  FIRST_LINE_MAX,
  MESSAGE_TAG,
  WRAP_UP,
  autoPrefix,
  buildEventMessage,
  isMergeEvent,
  cleanField,
  firstPrefill,
  prefillOptions,
  prepareAuto,
  prepareSend,
  type EventContext,
  type OrcaEventKind,
  type PrefillFacts,
} from '../shared/orca-message';

const KINDS: OrcaEventKind[] = [
  'approve',
  'request-changes',
  'comment',
  'merge',
  'admin-merge',
  'auto-merge-on',
  'auto-merge-off',
  'ready',
  'issue-close',
  'issue-reopen',
];

const ctx: EventContext = { repo: 'acme-co/acme-web', number: 1355, actor: 'acme-dev', method: 'squash', reason: 'completed' };

describe('buildEventMessage', () => {
  it.each(KINDS)('%s: tagged, one sentence, link on line two, at most 160 characters', (kind) => {
    const [first, link, extra] = buildEventMessage(kind, ctx).split('\n');
    expect(first?.startsWith(autoPrefix(kind))).toBe(true);
    expect(first?.startsWith(MESSAGE_TAG)).toBe(true);
    expect(first?.length).toBeLessThanOrEqual(FIRST_LINE_MAX);
    expect(link).toBe(
      kind.startsWith('issue')
        ? 'https://github.com/acme-co/acme-web/issues/1355'
        : 'https://github.com/acme-co/acme-web/pull/1355',
    );
    expect(extra).toBeUndefined();
  });

  it('words the approve template exactly', () => {
    expect(buildEventMessage('approve', ctx).split('\n')[0]).toBe(
      '[nod] FYI, no action needed: acme-co/acme-web #1355 was approved by acme-dev.',
    );
  });

  it('keeps the FYI wording and asks nothing for every kind but merge', () => {
    for (const kind of KINDS.filter((k) => !isMergeEvent(k))) {
      const msg = buildEventMessage(kind, ctx);
      expect(msg.startsWith(AUTO_PREFIX)).toBe(true);
      expect(msg).not.toContain(WRAP_UP);
      expect(msg.toLowerCase()).not.toMatch(/\b(please|run|fix|merge it|you should)\b/);
    }
  });

  it('words the merge template exactly, with and without a method', () => {
    expect(buildEventMessage('merge', ctx).split('\n')[0]).toBe(
      '[nod] acme-co/acme-web #1355 was merged by acme-dev (squash). Finish any follow-up for it, then run /compress to wrap up.',
    );
    expect(buildEventMessage('merge', { ...ctx, method: undefined }).split('\n')[0]).toBe(
      '[nod] acme-co/acme-web #1355 was merged by acme-dev. Finish any follow-up for it, then run /compress to wrap up.',
    );
  });

  it('words the admin merge template exactly', () => {
    expect(buildEventMessage('admin-merge', { repo: 'acme-co/acme-api', number: 349, actor: 'acme-dev' })).toBe(
      '[nod] acme-co/acme-api #349 was admin merged by acme-dev. Finish any follow-up for it, then run /compress to wrap up.\n' +
        'https://github.com/acme-co/acme-api/pull/349',
    );
  });

  it.each(['merge', 'admin-merge'] as const)('%s: drops the FYI wording and puts a fitting title last', (kind) => {
    const first = buildEventMessage(kind, { ...ctx, title: 'Hide the sale' }, true).split('\n')[0]!;
    expect(first).not.toContain('FYI');
    expect(first).toMatch(/run \/compress to wrap up\. Title: "Hide the sale"$/);
    expect(first.length).toBeLessThanOrEqual(FIRST_LINE_MAX);
  });

  it.each(['merge', 'admin-merge'] as const)('%s: leaves out a title that would pass 160 characters', (kind) => {
    const first = buildEventMessage(kind, { ...ctx, title: 'x'.repeat(60) }, true).split('\n')[0]!;
    expect(first).not.toContain('Title');
    expect(first.endsWith(WRAP_UP)).toBe(true);
  });

  it.each(KINDS)('%s: a long repo and actor still cap the first line at 160', (kind) => {
    const msg = buildEventMessage(kind, { ...ctx, repo: 'r'.repeat(120), actor: 'a'.repeat(80), title: 'short' }, true);
    const [first, link] = msg.split('\n');
    expect(first!.length).toBeLessThanOrEqual(FIRST_LINE_MAX);
    expect(first!.startsWith(MESSAGE_TAG)).toBe(true);
    expect(link).toMatch(/^https:\/\/github\.com\//);
  });

  it('leaves the title out by default', () => {
    expect(buildEventMessage('approve', { ...ctx, title: 'Hide the sale bonus' })).not.toContain('Hide the sale');
  });

  it('adds a short title in quotes when asked', () => {
    const line = buildEventMessage('approve', { ...ctx, title: 'Hide the sale bonus' }, true).split('\n')[0];
    expect(line).toContain('Title: "Hide the sale bonus"');
  });

  it('leaves out a title over 60 characters', () => {
    const title = 'x'.repeat(61);
    expect(buildEventMessage('approve', { ...ctx, title }, true)).not.toContain('Title');
  });

  it('strips control characters, newlines and backticks from the title', () => {
    const msg = buildEventMessage('approve', { ...ctx, title: 'a`b\nc\u001b[31md' }, true);
    expect(msg.split('\n')).toHaveLength(2);
    // eslint-disable-next-line no-control-regex
    expect(msg).not.toMatch(/[\u001b`]/);
  });

  it('carries only the fixed template, repo, number, actor and link', () => {
    const msg = buildEventMessage('comment', { ...ctx, actor: 'acme`-\ndev\u0007' });
    expect(msg).not.toMatch(/[`\u0007]/);
    expect(msg.split('\n')[0]).toContain('acme-dev commented on acme-co/acme-web #1355');
  });

  it('drops anything outside the GitHub alphabet from repo and actor', () => {
    const msg = buildEventMessage('approve', { ...ctx, repo: 'a b;rm -rf', actor: 'x y' });
    expect(msg).not.toMatch(/[; ]rm/);
    expect(msg.split('\n')[0]).toContain('abrm-rf #1355');
  });

  it('words issue close by reason', () => {
    expect(buildEventMessage('issue-close', { ...ctx, reason: 'not-planned' })).toContain('closed as not planned');
    expect(buildEventMessage('issue-close', ctx)).toContain('closed as completed');
  });
});

describe('prepareSend', () => {
  it('tags text that lacks the tag and keeps text that has it', () => {
    expect(prepareSend('look at this')).toBe('[nod] look at this');
    expect(prepareSend('[nod] hi')).toBe('[nod] hi');
  });

  it('never lets text start with a dash', () => {
    expect(prepareSend('--help')?.startsWith('[nod]')).toBe(true);
  });

  it('removes control characters and joins lines', () => {
    // eslint-disable-next-line no-control-regex
    expect(prepareSend('a\u001b[2Jb\r\nc\u0000')).toBe('[nod] a [2Jb c');
  });

  it('refuses empty and over-long text', () => {
    expect(prepareSend('   \n ')).toBeUndefined();
    expect(prepareSend('x'.repeat(601))).toBeUndefined();
  });

  it('allows exactly 600 characters', () => {
    const body = '[nod] ' + 'x'.repeat(594);
    expect(body).toHaveLength(600);
    expect(prepareSend(body)).toBe(body);
  });
});

describe('prepareAuto and cleanField', () => {
  it('keeps two lines and cleans each', () => {
    expect(prepareAuto('a\u0007b\nhttps://x\n')).toBe('a b\nhttps://x');
  });

  it('cuts GitHub strings to 40 characters', () => {
    expect(cleanField('y'.repeat(80))).toHaveLength(40);
  });
});

const facts: PrefillFacts = {
  repo: 'acme-co/acme-web',
  number: 1355,
  headRef: 'build-bot/posthog-opt-in',
  baseRef: 'staging',
  conflicting: false,
  ci: 'pass',
  failing: [],
  checkTotal: 3,
  changesRequested: true,
  changesBy: 'acme-dev',
  openThreads: 2,
};

describe('prefillOptions', () => {
  it('fills the review comment from counts and names only', () => {
    const [review] = prefillOptions(facts);
    expect(review?.text).toBe(
      '[nod] Please look at the review on acme-co/acme-web #1355 (changes requested by acme-dev, 2 open threads). Comments: https://github.com/acme-co/acme-web/pull/1355',
    );
  });

  it('disables chips with nothing to fill and says why', () => {
    const opts = prefillOptions(facts);
    expect(opts.find((o) => o.chip === 'ci')?.why).toBe('CI failed is off: CI is not failing.');
    expect(opts.find((o) => o.chip === 'ci')?.text).toBeUndefined();
    expect(opts.find((o) => o.chip === 'conflicts')?.text).toBeUndefined();
  });

  it('enables CI failed with the failing check', () => {
    const opts = prefillOptions({ ...facts, changesRequested: false, openThreads: 0, ci: 'fail', failing: ['rspec'] });
    expect(opts.find((o) => o.chip === 'ci')?.text).toContain('check "rspec" failed (1 of 3 checks)');
    expect(firstPrefill(opts)?.chip).toBe('ci');
  });

  it('enables Conflicts and cleans the branch names', () => {
    const opts = prefillOptions({ ...facts, changesRequested: false, openThreads: 0, conflicting: true, headRef: 'a`b' });
    const text = opts.find((o) => o.chip === 'conflicts')?.text ?? '';
    expect(text).toContain('merge conflicts with staging');
    expect(text).not.toContain('`');
  });

  it('Blank is always on and last', () => {
    const opts = prefillOptions({ ...facts, changesRequested: false, openThreads: 0 });
    expect(opts.at(-1)).toMatchObject({ chip: 'blank', text: '[nod] ' });
    expect(firstPrefill(opts)?.chip).toBe('blank');
  });
});
