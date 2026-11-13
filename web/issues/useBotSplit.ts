import { useCallback } from 'react';
import type { IssueAction, IssueComment, IssueDetail, SplitPart } from '../../shared/issue-types';
import { proposedSplit, splitCommand, splitState, type BotRequest, type SplitState } from '../../shared/bot';
import { bot } from '../org-settings';
import { useBotCommand, type BotCommand } from './useBotCommand';

export interface BotSplit extends BotCommand<SplitState> {
  /** The parts the bot's newest comment proposes. */
  parts: SplitPart[];
}

/** Sub-issues the issue has, from the list summary or the loaded children. */
export const subIssueCount = (d: IssueDetail): number => Math.max(d.summary.subIssues?.total ?? 0, d.subIssues.length);

/**
 * One-tap bot split: posts the split command and waits for the bot's next comment. Nod never opens
 * the parts itself. `onAnswered` reloads the issue so the new sub-issues show.
 */
export function useBotSplit(
  detail: IssueDetail | undefined,
  viewer: string,
  post: (action: IssueAction) => Promise<boolean>,
  onAnswered: () => void,
): BotSplit {
  const subs = detail ? subIssueCount(detail) : 0;
  const stateOf = useCallback(
    (comments: readonly IssueComment[], req: BotRequest | undefined) => splitState(comments, subs, req),
    [subs],
  );
  const cmd = useBotCommand(detail, viewer, post, splitCommand(bot()), stateOf, 'hidden', onAnswered);
  return { ...cmd, parts: (detail && proposedSplit(detail.comments)) ?? [] };
}
