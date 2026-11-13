import { describe, expect, it } from 'vitest';
import { followAnnouncement } from '../web/FollowStatus';

const prs = new Map([['PR_42', { repo: 'acme-web', number: 42 }]]);

describe('followAnnouncement', () => {
  it('announces a new chip state', () => {
    expect(followAnnouncement({}, { PR_42: 'auto-merge' }, prs)).toBe('acme-web #42: auto-merge is on, waiting for checks');
    expect(followAnnouncement({ PR_42: 'auto-merge' }, { PR_42: 'merged' }, prs)).toBe('acme-web #42 merged');
    expect(followAnnouncement({}, { PR_42: 'approved' }, prs)).toBe('acme-web #42 approved');
  });

  it('stays silent on a repeat poll and when a chip clears', () => {
    expect(followAnnouncement({ PR_42: 'auto-merge' }, { PR_42: 'auto-merge' }, prs)).toBeUndefined();
    expect(followAnnouncement({ PR_42: 'approved' }, {}, prs)).toBeUndefined();
  });

  it('skips a PR the client does not know', () => {
    expect(followAnnouncement({}, { PR_99: 'merged' }, prs)).toBeUndefined();
  });
});
