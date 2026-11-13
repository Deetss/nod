import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IssueAction, IssueComment, IssueDetail } from '../../shared/issue-types';
import { newestBot, withPostedComment, type BotRequest } from '../../shared/bot';

export interface BotCommand<S extends string> {
  state: S;
  /** Posts the command. Ignored unless it is offered, so a double tap posts once. */
  request: () => void;
  /** The detail with the posted command already in its thread. */
  detail: IssueDetail | undefined;
}

/**
 * One-tap bot command. `post` sends the comment through the issue write path, reports its own
 * toast, and resolves to whether it worked; a failure rolls the pending state back. `onAnswered`
 * runs once when the bot comments after a posted command.
 */
export function useBotCommand<S extends string>(
  detail: IssueDetail | undefined,
  viewer: string,
  post: (action: IssueAction) => Promise<boolean>,
  body: string,
  stateOf: (comments: readonly IssueComment[], req: BotRequest | undefined) => S,
  hidden: S,
  onAnswered?: () => void,
  /** Which states accept a press. Defaults to `offered`. */
  canRequest?: (state: S) => boolean,
): BotCommand<S> {
  const [requests, setRequests] = useState<ReadonlyMap<string, BotRequest>>(new Map());
  const sending = useRef(new Set<string>());
  const id = detail?.summary.id;
  const req = id ? requests.get(id) : undefined;
  const state = detail ? stateOf(detail.comments, req) : hidden;

  const shown = useMemo(
    () => (detail && req ? { ...detail, comments: withPostedComment(detail.comments, req, viewer, body) } : detail),
    [detail, req, viewer, body],
  );

  // Pending ends with the request still standing only when the bot answered; a rollback drops it.
  const seen = useRef<{ id: string | undefined; state: S }>({ id, state });
  const answered = useRef(onAnswered);
  answered.current = onAnswered;
  useEffect(() => {
    const prev = seen.current;
    seen.current = { id, state };
    if (prev.id === id && prev.state === 'pending' && state !== 'pending' && req) answered.current?.();
  }, [id, state, req]);

  const request = useCallback(() => {
    if (!detail || !(canRequest ? canRequest(state) : state === 'offered')) return;
    const { id: issueId, repo, number } = detail.summary;
    if (sending.current.has(issueId)) return;
    sending.current.add(issueId);
    const next: BotRequest = {
      after: newestBot(detail.comments)?.id,
      count: detail.comments.length,
      at: new Date().toISOString(),
    };
    setRequests((m) => new Map(m).set(issueId, next));
    void post({ type: 'comment', repo, number, body }).then((ok) => {
      sending.current.delete(issueId);
      if (ok) return;
      setRequests((m) => {
        const n = new Map(m);
        n.delete(issueId);
        return n;
      });
    });
  }, [detail, state, post, body, canRequest]);

  return { state, request, detail: shown };
}
