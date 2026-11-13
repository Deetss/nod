import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  ACTIVITY_MAX_DAYS,
  ACTIVITY_WINDOW_DAYS,
  verbFor,
  type ActivityEvent,
  type ActivityFeed,
  type ActivityGroup,
  type ActivityItemRef,
  type ActivityKind,
  type ActivityNotice,
} from '../shared/activity-types';
import type { IssueInboxData, IssueSummary } from '../shared/issue-types';
import { sectionsFor } from '../shared/sections';
import type { InboxData, PrSummary } from '../shared/types';
import { stateDir } from './devices';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The store keeps four windows so `Load older` has something to show. */
export const RETENTION_MS = ACTIVITY_MAX_DAYS * DAY_MS;
const MAX_EVENTS = 5000;

/** What the last poll showed for one item, kept to diff the next poll against. */
interface Snap {
  ci?: string;
  review?: string;
  headSha?: string;
  commits?: number;
  asked?: boolean;
  labels?: string[];
  status?: string;
  comments?: number;
  open?: boolean;
  mentioned?: boolean;
  assigned?: boolean;
  merged?: boolean;
}

interface StoredEvent extends ActivityEvent {
  item: ActivityItemRef;
}

interface StoredNotice extends ActivityNotice {
  item: ActivityItemRef;
}

interface Persisted {
  events: StoredEvent[];
  snaps: Record<string, Snap>;
  lastVisit: number;
  /** Quiet Nod lines. Older files have none. */
  notices?: StoredNotice[];
}

export function defaultActivityPath(): string {
  return join(stateDir(), 'activity.json');
}

const same = (a: string | undefined, b: string): boolean => a?.toLowerCase() === b.toLowerCase();

function emptyState(): Persisted {
  return { events: [], snaps: {}, lastVisit: 0 };
}

function parse(raw: unknown): Persisted {
  const r = raw as Partial<Persisted> | null;
  if (!r || !Array.isArray(r.events) || typeof r.snaps !== 'object' || r.snaps === null) return emptyState();
  return {
    events: r.events,
    snaps: r.snaps,
    lastVisit: typeof r.lastVisit === 'number' ? r.lastVisit : 0,
    notices: Array.isArray(r.notices) ? r.notices : [],
  };
}

/**
 * Event log built from poll-to-poll differences. It records only what the saved lists show,
 * so reviewer and commenter logins are absent (see docs/design/activity-spec.md section 12).
 */
export class ActivityStore {
  private state: Persisted = emptyState();
  private viewer = '';
  private syncedAt = 0;
  private writing: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string | undefined) {}

  static memory(): ActivityStore {
    return new ActivityStore(undefined);
  }

  static async open(path: string = defaultActivityPath()): Promise<ActivityStore> {
    const store = new ActivityStore(path);
    try {
      store.state = parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
    } catch {
      // missing or unreadable file: start empty
    }
    return store;
  }

  /** Diffs the saved lists against the previous poll and records what moved. */
  observe(inbox: InboxData, issues: IssueInboxData | undefined, now: number = Date.now()): void {
    const viewer = inbox.viewer || issues?.viewer || '';
    this.viewer = viewer;
    this.syncedAt = Math.max(inbox.syncedAt, issues?.syncedAt ?? 0);
    // A list that is still loading is empty, which would read as every item vanishing.
    if (inbox.syncing) return;
    const fresh: StoredEvent[] = [];
    const snaps = { ...this.state.snaps };
    const teams = inbox.teams ?? [];

    for (const pr of inbox.prs) {
      const key = `pr:${pr.id}`;
      const next = snapOfPr(pr, viewer, teams, inbox.follows[pr.id]?.state === 'merged');
      fresh.push(...diffPr(refOfPr(pr), pr, snaps[key], next, viewer, teams, now));
      snaps[key] = next;
    }
    for (const [id, f] of Object.entries(inbox.follows)) {
      if (f.state !== 'merged' || !f.pr) continue;
      const key = `pr:${id}`;
      if (snaps[key]?.merged) continue;
      fresh.push(make(refOfPr(f.pr), 'merged', Date.parse(f.at) || now, { actor: viewer, needsMe: false }));
      snaps[key] = { ...snaps[key], merged: true, open: false };
    }
    if (issues && !issues.syncing) {
      const mentioned = new Set(issues.mentionedIds);
      for (const issue of issues.issues) {
        const key = `issue:${issue.id}`;
        const next = snapOfIssue(issue, viewer, mentioned.has(issue.id));
        fresh.push(...diffIssue(refOfIssue(issue), issue, snaps[key], next, viewer, now));
        snaps[key] = next;
      }
    }

    const known = new Set(this.state.events.map((e) => e.id));
    const added = fresh.filter((e) => !known.has(e.id));
    const events = [...this.state.events, ...added]
      .filter((e) => now - Date.parse(e.at) <= RETENTION_MS)
      .slice(-MAX_EVENTS);
    const changed = added.length > 0 || events.length !== this.state.events.length || !sameSnaps(snaps, this.state.snaps);
    this.state = { ...this.state, events, snaps };
    if (changed) this.persist();
  }

  /**
   * Adds a quiet line to an item's timeline. A notice is not an event: it never changes the unread
   * state, the badge or the row order, and it shows only on an item that already has events.
   */
  addNotice(item: ActivityItemRef, text: string, icon: ActivityNotice['icon'], now: number = Date.now()): void {
    const at = new Date(now).toISOString();
    const notice: StoredNotice = { id: `notice:${item.kind}:${item.id}:${now}:${this.state.notices?.length ?? 0}`, item, at, text, icon };
    const kept = (this.state.notices ?? []).filter((n) => now - Date.parse(n.at) <= RETENTION_MS);
    this.state = { ...this.state, notices: [...kept, notice].slice(-MAX_EVENTS) };
    this.persist();
  }

  /** Records the last visit, which clears every unread dot older than it. */
  visit(now: number = Date.now()): number {
    this.state = { ...this.state, lastVisit: now };
    this.persist();
    return now;
  }

  feed(days: number = ACTIVITY_WINDOW_DAYS, now: number = Date.now()): ActivityFeed {
    const window = clampDays(days);
    const cutoff = now - window * DAY_MS;
    const byItem = new Map<string, ActivityGroup>();
    let hasOlder = false;
    for (const e of this.state.events) {
      if (Date.parse(e.at) < cutoff) {
        hasOlder = true;
        continue;
      }
      const { item, ...event } = e;
      const key = `${item.kind}:${item.id}`;
      const group = byItem.get(key) ?? { item, events: [] };
      group.events.push(event);
      byItem.set(key, group);
    }
    const noticesByItem = new Map<string, ActivityNotice[]>();
    for (const { item, ...notice } of this.state.notices ?? []) {
      if (Date.parse(notice.at) < cutoff) continue;
      const key = `${item.kind}:${item.id}`;
      noticesByItem.set(key, [...(noticesByItem.get(key) ?? []), notice]);
    }
    const groups = [...byItem.entries()].map(([key, g]) => {
      const notices = (noticesByItem.get(key) ?? []).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return {
        item: g.item,
        events: [...g.events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
        ...(notices.length > 0 ? { notices } : {}),
      };
    });
    groups.sort((a, b) => Date.parse(b.events[0]!.at) - Date.parse(a.events[0]!.at));
    return {
      viewer: this.viewer,
      syncedAt: this.syncedAt,
      days: window,
      hasOlder,
      lastVisit: this.state.lastVisit,
      groups,
    };
  }

  private persist(): void {
    const path = this.path;
    if (!path) return;
    const body = JSON.stringify(this.state);
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        await writeFile(tmp, body, { mode: 0o600 });
        await rename(tmp, path);
      })
      .catch((e: unknown) => console.error('[activity] could not save:', e));
  }

  /** Resolves when pending writes finish. For tests. */
  async flush(): Promise<void> {
    await this.writing;
  }
}

/** Rounds up to whole weeks, between one and four. */
export function clampDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return ACTIVITY_WINDOW_DAYS;
  const weeks = Math.min(Math.ceil(days / 7), ACTIVITY_MAX_DAYS / 7);
  return weeks * 7;
}

function sameSnaps(a: Record<string, Snap>, b: Record<string, Snap>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function refOfPr(p: PrSummary): ActivityItemRef {
  return { kind: 'pr', id: p.id, repo: p.repo, number: p.number, title: p.title, url: p.url };
}

function refOfIssue(i: IssueSummary): ActivityItemRef {
  return { kind: 'issue', id: i.id, repo: i.repo, number: i.number, title: i.title, url: i.url };
}

function snapOfPr(pr: PrSummary, viewer: string, teams: readonly string[], merged: boolean): Snap {
  return {
    ci: pr.ci,
    review: pr.reviewStatus,
    headSha: pr.headSha,
    commits: pr.commitCount,
    asked: sectionsFor(pr, viewer, teams).includes('needs'),
    open: true,
    merged,
  };
}

function snapOfIssue(i: IssueSummary, viewer: string, mentioned: boolean): Snap {
  return {
    labels: i.labels.map((l) => l.name),
    status: i.status,
    comments: i.commentCount,
    open: i.state === 'open',
    mentioned,
    assigned: i.assignees.some((a) => same(a, viewer)),
  };
}

interface MakeOpts {
  actor?: string;
  detail?: string;
  needsMe: boolean;
}

function make(item: ActivityItemRef, kind: ActivityKind, at: number, o: MakeOpts): StoredEvent {
  const iso = new Date(at).toISOString();
  return {
    id: `${item.kind}:${item.id}:${kind}:${o.detail ?? ''}:${iso}`,
    item,
    kind,
    actor: o.actor,
    verb: verbFor(kind, o.detail),
    at: iso,
    detail: o.detail,
    needsMe: o.needsMe,
  };
}

function diffPr(
  item: ActivityItemRef,
  pr: PrSummary,
  prev: Snap | undefined,
  next: Snap,
  viewer: string,
  teams: readonly string[],
  now: number,
): StoredEvent[] {
  const out: StoredEvent[] = [];
  const own = same(pr.author, viewer);
  const created = Date.parse(pr.createdAt);
  if (!prev) {
    // First sighting. The PR's own timestamps tell when it opened, and nothing else is knowable.
    if (now - created <= RETENTION_MS) out.push(make(item, 'opened', created, { actor: pr.author, needsMe: false }));
    return out;
  }
  const at = Date.parse(pr.updatedAt) || now;
  if ((prev.commits ?? 0) < (next.commits ?? 0) || (prev.headSha && prev.headSha !== next.headSha)) {
    const added = (next.commits ?? 0) - (prev.commits ?? 0);
    out.push(make(item, 'commits', at, { actor: pr.author, detail: String(added > 0 ? added : 1), needsMe: false }));
  }
  if (prev.ci !== next.ci && (next.ci === 'fail' || next.ci === 'pass' || next.ci === 'running')) {
    out.push(make(item, 'ci', now, { detail: next.ci, needsMe: own && next.ci === 'fail' }));
  }
  if (prev.review !== next.review) {
    if (next.review === 'changes requested') out.push(make(item, 'changes', now, { needsMe: own }));
    else if (/^\d+ approvals?$/.test(next.review ?? '') && !/^\d+ approvals?$/.test(prev.review ?? '')) {
      out.push(make(item, 'approved', now, { needsMe: own }));
    }
  }
  if (!prev.asked && next.asked && sectionsFor(pr, viewer, teams).includes('needs')) {
    out.push(make(item, 'review-requested', now, { actor: pr.author, needsMe: true }));
  }
  return out;
}

function diffIssue(
  item: ActivityItemRef,
  issue: IssueSummary,
  prev: Snap | undefined,
  next: Snap,
  viewer: string,
  now: number,
): StoredEvent[] {
  const out: StoredEvent[] = [];
  const created = Date.parse(issue.createdAt);
  if (!prev) {
    if (now - created <= RETENTION_MS) out.push(make(item, 'opened', created, { actor: issue.author, needsMe: false }));
    return out;
  }
  const at = Date.parse(issue.updatedAt) || now;
  if ((next.comments ?? 0) > (prev.comments ?? 0)) out.push(make(item, 'comment', at, { needsMe: false }));
  if (next.mentioned && !prev.mentioned) out.push(make(item, 'mention', at, { needsMe: true }));
  if (next.assigned && !prev.assigned) out.push(make(item, 'assigned', now, { needsMe: true }));
  const before = new Set(prev.labels ?? []);
  const after = new Set(next.labels ?? []);
  for (const l of after) if (!before.has(l)) out.push(make(item, 'label-added', now, { detail: l, needsMe: false }));
  for (const l of before) if (!after.has(l)) out.push(make(item, 'label-removed', now, { detail: l, needsMe: false }));
  if (next.status && next.status !== prev.status) out.push(make(item, 'status', now, { detail: next.status, needsMe: false }));
  if (prev.open && !next.open) out.push(make(item, 'closed', at, { needsMe: false }));
  return out;
}
