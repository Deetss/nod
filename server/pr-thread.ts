import type { IssueComment } from '../shared/issue-types';
import { toMinimized } from '../shared/minimized';
import type { PrThreadItem, ReviewVerdict } from '../shared/types';

interface RawAuthor {
  login: string;
  avatarUrl?: string;
}

interface RawThreadComment {
  id: string;
  author: RawAuthor | null;
  bodyHTML: string;
  /** Markdown source. Requested on inline review comments only. */
  body?: string;
  /** PENDING until the review is submitted. Requested on inline review comments only. */
  state?: string;
  createdAt: string;
  url?: string;
  isMinimized?: boolean;
  minimizedReason?: string | null;
}

interface RawReview {
  id: string;
  author: RawAuthor | null;
  state: string;
  bodyHTML: string;
  submittedAt: string | null;
  url?: string;
  isMinimized?: boolean;
  minimizedReason?: string | null;
}

interface RawReviewThread {
  id?: string;
  isResolved: boolean;
  isOutdated?: boolean;
  path: string;
  line: number | null;
  diffSide?: 'LEFT' | 'RIGHT';
  startLine?: number | null;
  startDiffSide?: 'LEFT' | 'RIGHT' | null;
  comments: { nodes: RawThreadComment[] };
}

export interface RawPrThread {
  comments: { nodes: RawThreadComment[] };
  threadReviews: { nodes: RawReview[] };
  reviewThreads: { nodes: RawReviewThread[] };
}

const toComment = (c: RawThreadComment): IssueComment => {
  const minimized = toMinimized(c.isMinimized, c.minimizedReason);
  return {
    id: c.id,
    author: c.author?.login ?? 'ghost',
    avatarUrl: c.author?.avatarUrl,
    createdAt: c.createdAt,
    bodyHtml: c.bodyHTML,
    ...(c.body !== undefined ? { body: c.body } : {}),
    ...(c.url ? { url: c.url } : {}),
    ...(minimized ? { minimized } : {}),
  };
};

function verdictOf(state: string): ReviewVerdict {
  if (state === 'CHANGES_REQUESTED') return 'changes';
  if (state === 'APPROVED') return 'approved';
  return 'commented';
}

/** Comments, reviews and review threads as one oldest-first conversation. */
export function toPrThread(raw: RawPrThread): PrThreadItem[] {
  const comments = raw.comments.nodes.map(
    (c): PrThreadItem => ({ kind: 'comment', at: c.createdAt, comment: toComment(c) }),
  );
  // A bare COMMENTED review only wraps its inline threads, which show on their own.
  const reviews = raw.threadReviews.nodes.flatMap((r): PrThreadItem[] => {
    if (!r.submittedAt || !(r.bodyHTML.trim() || r.state !== 'COMMENTED')) return [];
    const minimized = toMinimized(r.isMinimized, r.minimizedReason);
    return [
      {
        kind: 'review',
        at: r.submittedAt,
        id: r.id,
        actor: r.author?.login ?? 'ghost',
        verdict: verdictOf(r.state),
        url: r.url,
        bodyHtml: r.bodyHTML.trim(),
        ...(minimized ? { minimized } : {}),
      },
    ];
  });
  const threads = raw.reviewThreads.nodes.flatMap((t): PrThreadItem[] => {
    const first = t.comments.nodes[0];
    if (!first) return [];
    return [
      {
        kind: 'thread',
        at: first.createdAt,
        id: first.id,
        ...(t.id ? { threadId: t.id } : {}),
        path: t.path,
        line: t.line ?? undefined,
        ...(t.diffSide ? { side: t.diffSide } : {}),
        ...(t.startLine ? { startLine: t.startLine } : {}),
        ...(t.startDiffSide ? { startSide: t.startDiffSide } : {}),
        resolved: t.isResolved,
        isOutdated: t.isOutdated === true,
        ...(first.state === 'PENDING' ? { pending: true } : {}),
        comments: t.comments.nodes.map(toComment),
      },
    ];
  });
  return [...comments, ...reviews, ...threads].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
