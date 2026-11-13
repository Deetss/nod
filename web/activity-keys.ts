export type ActivityKeyAction =
  | 'next'
  | 'prev'
  | 'open'
  | 'github'
  | 'refresh'
  | 'help'
  | 'escape'
  | 'goPrs'
  | 'goIssues'
  | 'goActivity';

const PLAIN: Record<string, ActivityKeyAction> = {
  j: 'next',
  k: 'prev',
  Enter: 'open',
  O: 'github',
  R: 'refresh',
  '?': 'help',
  Escape: 'escape',
};

const AFTER_G: Record<string, ActivityKeyAction> = { p: 'goPrs', i: 'goIssues', a: 'goActivity' };

/** What a key does in the desktop Activity view. `gPending` is true right after `g`. */
export function activityKeyAction(key: string, gPending: boolean): ActivityKeyAction | undefined {
  return (gPending ? AFTER_G[key] : undefined) ?? PLAIN[key];
}
