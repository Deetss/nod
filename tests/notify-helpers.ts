import type { IssueInboxData, IssueSummary } from '../shared/issue-types';
import type { PushPayload, PushSubscriptionJson } from '../shared/push';
import type { InboxData, PrSummary, ShippedPr } from '../shared/types';
import type { PollResult, Provider, SyncEvent } from '../server/provider';
import type { PushSender } from '../server/push';

export const VIEWER = 'acme-dev';

export function pr(over: Partial<PrSummary> & { number: number }): PrSummary {
  return {
    id: `PR_${over.number}`,
    repo: 'acme-api',
    title: `Title ${over.number}`,
    author: 'sam',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    headSha: 'abc',
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'no reviews yet',
    seen: 'new',
    url: 'https://github.com/acme-co/acme-api/pull/1',
    isDraft: false,
    requested: [],
    ...over,
  };
}

export function issue(over: Partial<IssueSummary> & { number: number }): IssueSummary {
  return {
    id: `I_${over.number}`,
    repo: 'acme-api',
    title: `Issue ${over.number}`,
    author: 'sam',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    url: `https://github.com/acme-co/acme-api/issues/${over.number}`,
    state: 'open',
    labels: [],
    assignees: [],
    commentCount: 0,
    seen: 'new',
    ...over,
  } as IssueSummary;
}

export interface Snapshot {
  prs?: PrSummary[];
  shipped?: ShippedPr[];
  issues?: IssueSummary[];
  mentionedIds?: string[];
  teams?: string[];
}

/**
 * A provider that serves one snapshot at a time. `poll` moves to the next queued snapshot and
 * emits change notices the way the GitHub provider does: one as the sync starts, one at its end.
 */
export class FakeProvider {
  readonly fixtures = false;
  private current: Snapshot;
  private readonly queue: Snapshot[];
  private readonly listeners = new Set<(e: SyncEvent) => void>();
  polls = 0;

  constructor(first: Snapshot, ...rest: Snapshot[]) {
    this.current = first;
    this.queue = rest;
  }

  push(next: Snapshot): void {
    this.queue.push(next);
  }

  async inbox(): Promise<InboxData> {
    const { prs = [], teams = [], shipped = [] } = this.current;
    return { viewer: VIEWER, teams, prs, shipped, syncedAt: this.polls, follows: {} };
  }

  async issues(): Promise<IssueInboxData> {
    const { issues = [], mentionedIds = [] } = this.current;
    return { viewer: VIEWER, issues, mentionedIds, syncedAt: this.polls };
  }

  async poll(): Promise<PollResult> {
    this.emit({ prs: this.polls, issues: this.polls, syncing: true });
    const next = this.queue.shift();
    if (next) this.current = next;
    this.polls += 1;
    this.emit({ prs: this.polls, issues: this.polls });
    return { changed: next !== undefined };
  }

  budget(): undefined {
    return undefined;
  }

  subscribe(fn: (e: SyncEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: SyncEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  asProvider(): Provider {
    return this as unknown as Provider;
  }
}

export const SUB: PushSubscriptionJson = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };

/** A sender that records payloads, or rejects with `status` for every send. */
export function recordingSender(status?: number): { send: PushSender; sent: PushPayload[] } {
  const sent: PushPayload[] = [];
  const send: PushSender = async (_sub, payload) => {
    if (status) throw Object.assign(new Error('push service refused'), { statusCode: status });
    sent.push(payload);
  };
  return { send, sent };
}

/** Lets queued promise chains, such as a notifier pass, run to the end. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}
