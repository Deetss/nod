import { describe, expect, it } from 'vitest';
import { DeviceStore } from '../server/devices';
import { PushNotifier } from '../server/push';
import { FakeProvider, issue, pr, recordingSender, settle, SUB, VIEWER, type Snapshot } from './notify-helpers';

/**
 * Runs the phone notifier over a sequence of snapshots, one poll each, and returns the titles
 * pushed after each poll. The first snapshot is the baseline.
 */
async function pushesAcross(first: Snapshot, ...rest: Snapshot[]): Promise<string[][]> {
  const provider = new FakeProvider(first, ...rest);
  const devices = DeviceStore.memory();
  await devices.setPush(await devices.add('Phone'), SUB);
  const { send, sent } = recordingSender();
  const notifier = new PushNotifier(provider.asProvider(), devices, send, { info: () => undefined, warn: () => undefined });
  notifier.start();
  await notifier.onSync();
  const perPoll: string[][] = [sent.map((p) => p.title)];
  for (let i = 0; i < rest.length; i++) {
    const before = sent.length;
    await provider.poll();
    await settle();
    perPoll.push(sent.slice(before).map((p) => p.title));
  }
  return perPoll;
}

describe('every trigger fires once per change, through the phone notifier', () => {
  it('review requested: on the user or a team, and not again while it stays requested', async () => {
    const asked = pr({ number: 1, requested: [VIEWER] });
    const team = pr({ number: 2, requested: ['dev-lead'] });
    const polls = await pushesAcross(
      { prs: [], teams: ['dev-lead'] },
      { prs: [asked, team], teams: ['dev-lead'] },
      { prs: [asked, team], teams: ['dev-lead'] },
    );
    expect(polls).toEqual([[], ['Review requested: acme-api #1', 'Review requested: acme-api #2'], []]);
  });

  it('new review on my PR: changes requested, then an approval, each once', async () => {
    const mine = (reviewStatus: string) => pr({ number: 3, author: VIEWER.toLowerCase(), reviewStatus });
    const polls = await pushesAcross(
      { prs: [mine('no reviews yet')] },
      { prs: [mine('changes requested')] },
      { prs: [mine('changes requested')] },
      { prs: [mine('1 approval')] },
    );
    expect(polls).toEqual([[], ['Changes requested: acme-api #3'], [], ['Approved: acme-api #3']]);
  });

  it('new review: ignores reviews on other people\'s PRs', async () => {
    const theirs = (reviewStatus: string) => pr({ number: 4, author: 'sam', reviewStatus });
    expect(await pushesAcross({ prs: [theirs('no reviews yet')] }, { prs: [theirs('1 approval')] })).toEqual([[], []]);
  });

  it('CI failing on my PR: once when it turns red, not while it stays red', async () => {
    const mine = (ci: 'running' | 'fail') => pr({ number: 5, author: VIEWER, ci });
    const polls = await pushesAcross({ prs: [mine('running')] }, { prs: [mine('fail')] }, { prs: [mine('fail')] });
    expect(polls).toEqual([[], ['CI failing: acme-api #5'], []]);
  });

  it('my PR merged or closed: once per PR, however many polls still list it', async () => {
    const merged = { id: 'PR_10', repo: 'llm-gateway', number: 10, title: 'Ship it', merged: true, at: 1 };
    const closed = { id: 'PR_11', repo: 'acme-api', number: 11, title: 'Drop it', merged: false, at: 2 };
    const polls = await pushesAcross(
      { shipped: [] },
      { shipped: [merged] },
      { shipped: [closed, merged] },
      { shipped: [closed, merged] },
    );
    expect(polls).toEqual([[], ['Merged: llm-gateway #10'], ['Closed: acme-api #11'], []]);
  });

  it('issue assigned: once, matching the login in any case', async () => {
    const open = issue({ number: 6 });
    const assigned = issue({ number: 6, assignees: [VIEWER.toLowerCase()] });
    const polls = await pushesAcross({ issues: [open] }, { issues: [assigned] }, { issues: [assigned] });
    expect(polls).toEqual([[], ['Issue assigned: acme-api #6'], []]);
  });

  it('mention: once when an issue starts mentioning the user', async () => {
    const i = issue({ number: 8 });
    const polls = await pushesAcross(
      { issues: [i], mentionedIds: [] },
      { issues: [i], mentionedIds: [i.id] },
      { issues: [i], mentionedIds: [i.id] },
    );
    expect(polls).toEqual([[], ['Issue mentions you: acme-api #8'], []]);
  });

  it('the first sync is a baseline that later polls never reset', async () => {
    const asked = pr({ number: 9, requested: [VIEWER] });
    const polls = await pushesAcross({ prs: [asked] }, { prs: [asked] }, { prs: [asked] });
    expect(polls).toEqual([[], [], []]);
  });
});
