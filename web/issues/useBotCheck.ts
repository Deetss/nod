import { useCallback } from 'react';
import type { IssueAction, IssueComment, IssueDetail } from '../../shared/issue-types';
import { checkCommand, checkState, trimCommand, trimState, type BotRequest, type CheckFlowState, type TrimFlowState } from '../../shared/bot';
import { bot } from '../org-settings';
import { useBotCommand, type BotCommand } from './useBotCommand';

/** Pressing Check starts from idle, a verdict or a failure. Pending and hidden never accept a press. */
const canCheck = (s: CheckFlowState): boolean => s === 'idle' || s === 'verdict' || s === 'failed';
const canTrim = (s: TrimFlowState): boolean => s === 'offered';

export type BotCheck = BotCommand<CheckFlowState>;
export type BotTrim = BotCommand<TrimFlowState>;

/** One-tap bot check: posts the check command and waits for the bot's verdict. Hidden while the bot is off. */
export function useBotCheck(detail: IssueDetail | undefined, viewer: string, post: (action: IssueAction) => Promise<boolean>): BotCheck {
  const stateOf = useCallback(
    (comments: readonly IssueComment[], req: BotRequest | undefined): CheckFlowState =>
      bot().enabled ? checkState(comments, req) : 'hidden',
    [],
  );
  return useBotCommand(detail, viewer, post, checkCommand(bot()), stateOf, 'hidden', undefined, canCheck);
}

/**
 * One-tap bot trim: posts the trim command and waits for the bot's reply or the issue body to change.
 * `onAnswered` reloads the issue so the moved criteria show in the body.
 */
export function useBotTrim(
  detail: IssueDetail | undefined,
  viewer: string,
  post: (action: IssueAction) => Promise<boolean>,
  onAnswered: () => void,
): BotTrim {
  const updatedAt = detail?.summary.updatedAt ?? '';
  const stateOf = useCallback(
    (comments: readonly IssueComment[], req: BotRequest | undefined): TrimFlowState =>
      bot().enabled ? trimState(comments, req, { updatedAt }) : 'hidden',
    [updatedAt],
  );
  return useBotCommand(detail, viewer, post, trimCommand(bot()), stateOf, 'hidden', onAnswered, canTrim);
}
