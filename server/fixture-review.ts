import type { DiffSide, PendingReview, PrThreadItem } from '../shared/types';
import { FIXTURE_VIEWER } from './fixture-data';

/** One draft comment the viewer has in their pending review. */
export interface FixtureDraft {
  id: string;
  path: string;
  line?: number;
  side?: DiffSide;
  body: string;
}

const AT = '2026-11-09T10:00:00Z';

/**
 * Synthetic inline review state for the fixture PR, changed in memory by the comment actions.
 * The viewer starts with one pending review holding two drafts. Resolve state lives in an overlay
 * keyed by thread id, so resolving a fixture thread shows up on the next detail read.
 */
export class FixtureReview {
  private open = true;
  private drafts: FixtureDraft[] = [
    { id: 'PRRC_fxdraft1', path: 'sandbox-api/web_tools.py', line: 27, side: 'RIGHT', body: 'Drop this cache.' },
    { id: 'PRRC_fxdraft2', path: 'sandbox-api/app.py', line: 9, side: 'RIGHT', body: 'Add a module docstring.' },
  ];
  private readonly resolved = new Map<string, boolean>();
  /** Replies added to fixture threads, keyed by thread id, in order. */
  private readonly replies = new Map<string, { id: string; body: string }[]>();
  private seq = 0;

  /** The viewer's pending review, or undefined once it is discarded or submitted. */
  pending(): PendingReview | undefined {
    return this.open ? { id: 'PRR_fxpending', drafts: this.drafts.length } : undefined;
  }

  /** Adds a draft, opening a pending review first if none is open. */
  addDraft(d: Omit<FixtureDraft, 'id'>): FixtureDraft {
    this.open = true;
    this.seq += 1;
    const draft = { ...d, id: `PRRC_fxnew${this.seq}` };
    this.drafts.push(draft);
    return draft;
  }

  /** Changes a draft's body. False when no such draft exists. */
  editDraft(id: string, body: string): boolean {
    const d = this.drafts.find((x) => x.id === id);
    if (!d) return false;
    d.body = body;
    return true;
  }

  /** Removes one draft. False when no such draft exists. */
  deleteDraft(id: string): boolean {
    const before = this.drafts.length;
    this.drafts = this.drafts.filter((x) => x.id !== id);
    return this.drafts.length !== before;
  }

  /** Clears the pending review: discard or submit. */
  close(): void {
    this.open = false;
    this.drafts = [];
  }

  setResolved(threadId: string, resolved: boolean): void {
    this.resolved.set(threadId, resolved);
  }

  /** Adds a reply to a fixture thread. The reply shows on the next detail read. */
  addReply(threadId: string, body: string): void {
    this.seq += 1;
    const list = this.replies.get(threadId) ?? [];
    list.push({ id: `PRRC_fxreply${this.seq}`, body });
    this.replies.set(threadId, list);
  }

  /** The replies added to a thread, oldest first. Empty when none. */
  repliesFor(threadId: string): { id: string; body: string }[] {
    return this.replies.get(threadId) ?? [];
  }

  /** The resolve state a thread carries after mutations, or undefined when unchanged. */
  resolvedOverride(threadId: string): boolean | undefined {
    return this.resolved.get(threadId);
  }

  /** Draft threads, shown as pending in the conversation. */
  draftThreads(): PrThreadItem[] {
    return this.drafts.map((d): PrThreadItem => ({
      kind: 'thread',
      at: AT,
      id: d.id,
      threadId: `PRRT_${d.id}`,
      path: d.path,
      ...(d.line !== undefined ? { line: d.line } : {}),
      ...(d.side ? { side: d.side } : {}),
      resolved: false,
      isOutdated: false,
      pending: true,
      comments: [{ id: d.id, author: FIXTURE_VIEWER, createdAt: AT, bodyHtml: `<p>${d.body}</p>`, body: d.body }],
    }));
  }
}
