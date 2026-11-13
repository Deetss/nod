import type { IssueAction, IssueDetail } from '../../shared/issue-types';
import { retryCommand, retryState, type RetryState } from '../../shared/bot';
import { bot } from '../org-settings';
import { useBotCommand, type BotCommand } from './useBotCommand';

export type BotRetry = BotCommand<RetryState>;

/** One-tap bot retry: posts the retry command and waits for the bot's next comment. */
export function useBotRetry(
  detail: IssueDetail | undefined,
  viewer: string,
  post: (action: IssueAction) => Promise<boolean>,
): BotRetry {
  return useBotCommand(detail, viewer, post, retryCommand(bot()), retryState, 'hidden');
}
