/** Rows of the action sheet, decided by who owns the item and what the viewer may do. */

import { botHeld, checkCommand, retryCommand, splitCommand, splitHeld, trimCommand, type RetryState, type SplitState } from '../../shared/bot';
import { emphasisFor } from '../issues/bot-card';
import { DRAFT_HINT, OWN_PR_HINT } from '../../shared/pr-actions';
import type { ProjectStatus } from '../../shared/project-status';
import type { BotSettings } from '../../shared/settings';
import { bot, projectStatuses, statusOption } from '../org-settings';
import { repoLabel } from '../repo-label';
import type { PhoneBotState } from './bot-check-phone';

export { OWN_PR_HINT };

export type StatusActionId = `status:${ProjectStatus}`;

export type ActionId =
  | StatusActionId
  | 'start-work'
  | 'stop-work'
  | 'reopen'
  | 'request-changes'
  | 'auto-merge'
  | 'admin-merge'
  | 'ready'
  | 'dispatch'
  | 'fix-checks'
  | 'fix-conflicts'
  | 'fix-bot'
  | 'fix-dispatch'
  | 'edit-title'
  | 'hand-bot'
  | 'bot-retry'
  | 'bot-split'
  | 'bot-check'
  | 'bot-trim'
  | 'new-issue'
  | 'new-sub-issue'
  | 'assign-me'
  | 'comment'
  | 'close-completed'
  | 'close-not-planned'
  | 'open-github'
  | 'copy-link'
  | 'share-link';

export interface ActionContext {
  target: 'pr' | 'issue';
  /** The PR was opened by the viewer. GitHub refuses own approvals and change requests. */
  ownPr: boolean;
  /** The viewer authored the PR and GitHub says they can merge as admin. */
  isAdmin: boolean;
  /** Every check passed and the PR is not a draft, so Admin merge may run. */
  adminReady: boolean;
  /** The PR is a draft, so GitHub refuses to merge it. */
  draft?: boolean;
  orcaAvailable: boolean;
  issueOpen: boolean;
  assignedToViewer: boolean;
  /** The org project's Status options resolved, so Start work also sets the status. */
  projectStatus?: boolean;
  /** The issue's current Status; absent means Backlog. */
  status?: ProjectStatus;
  /** Offline or rate limited: every write is disabled. */
  writesOff: boolean;
  /** The browser offers navigator.share, so Share is listed. */
  canShare?: boolean;
  /** The issue's repo, named in the New issue row. */
  repo?: string;
  /** The issue's number, named in the Create sub-issue row. */
  number?: number;
  /** The issue already has the bot label. */
  withBot?: boolean;
  /** The bot's retry; absent or hidden leaves the row out. */
  botRetry?: RetryState;
  /** The bot's proposed split and its part count; absent or hidden leaves the row out. */
  botSplit?: { state: SplitState; parts: number };
  /** The bot check and Trim state; absent or hidden leaves the check rows out. */
  botState?: PhoneBotState;
  /** A write request is running. */
  busy?: boolean;
  /** Failing checks on an open PR; absent or zero hides the Fix row. `orca` is true when Orca can take the PR. */
  fix?: { count: number; orca: boolean };
  /** The open PR conflicts with its base, so the Fix conflicts row shows. */
  conflicts?: boolean;
}

export interface ActionItem {
  id: ActionId;
  label: string;
  sub?: string;
  /** Why the row cannot run right now. Shown instead of `sub`. */
  disabled?: string;
  /** Needs the confirm dialog before it runs. */
  confirm?: boolean;
  /** Opens another sheet, so the row shows a chevron. */
  opens?: boolean;
  /** Drawn with a dashed outline: the state is a fact, not an action. */
  dashed?: boolean;
  /** Restyles the row for the verdict's follow-up: primary (accent) or neutral (Not planned). */
  emphasis?: 'primary' | 'neutral';
}

/**
 * The issue sheet's bar button: start, then mark done once work started. With the project
 * on, work has started when Status is In progress; otherwise when the viewer is assigned.
 */
export function issuePrimary(
  ctx: Pick<ActionContext, 'issueOpen' | 'assignedToViewer' | 'projectStatus' | 'status'>,
): {
  id: 'start-work' | 'mark-done' | 'reopen';
  label: string;
} {
  if (!ctx.issueOpen) return { id: 'reopen', label: 'Reopen' };
  const started = ctx.projectStatus ? ctx.status === statusOption('inProgress') : ctx.assignedToViewer;
  return started ? { id: 'mark-done', label: 'Mark done' } : { id: 'start-work', label: 'Start work' };
}

const OFFLINE = 'Offline';

/** Link rows touch no GitHub write, so they stay enabled offline. */
const LINK_IDS: readonly ActionId[] = ['open-github', 'copy-link', 'share-link'];

function linkItems(ctx: Pick<ActionContext, 'canShare'>): ActionItem[] {
  const items: ActionItem[] = [{ id: 'copy-link', label: 'Copy link' }];
  if (ctx.canShare) items.push({ id: 'share-link', label: 'Share...' });
  return items;
}

export function approveDisabled(ctx: Pick<ActionContext, 'ownPr' | 'writesOff'>): string | undefined {
  if (ctx.writesOff) return OFFLINE;
  return ctx.ownPr ? OWN_PR_HINT : undefined;
}

function prItems(ctx: ActionContext): ActionItem[] {
  const items: ActionItem[] = [
    {
      id: 'request-changes',
      label: 'Request changes',
      sub: 'Opens the composer',
      disabled: approveDisabled(ctx),
    },
    {
      id: 'auto-merge',
      label: 'Auto-merge',
      sub: 'Merges when checks pass',
      disabled: ctx.draft ? DRAFT_HINT : undefined,
      confirm: true,
    },
  ];
  if (ctx.draft && ctx.ownPr) {
    items.push({ id: 'ready', label: 'Ready for review', sub: 'Takes the PR out of draft', confirm: true });
  }
  if (ctx.isAdmin) {
    items.push({
      id: 'admin-merge',
      label: 'Admin merge',
      sub: 'Bypasses required review',
      disabled: ctx.adminReady ? undefined : ctx.draft ? DRAFT_HINT : 'Waiting for checks',
      confirm: true,
    });
  }
  if (ctx.conflicts) {
    items.push({ id: 'fix-conflicts', label: 'Fix conflicts…', sub: 'Branch conflicts with its base', opens: true });
  }
  const b = bot();
  if (ctx.fix && ctx.fix.count >= 1 && (b.enabled || ctx.fix.orca)) {
    const how = b.enabled ? (ctx.fix.orca ? `${b.name} or Orca` : `Asks ${b.name}`) : 'Orca';
    items.push({ id: 'fix-checks', label: 'Fix checks…', sub: `${ctx.fix.count} failing. ${how}`, opens: true });
  }
  if (ctx.orcaAvailable) {
    items.push({ id: 'dispatch', label: 'Dispatch with Orca', sub: 'Asks to confirm first', confirm: true });
  }
  items.push({ id: 'comment', label: 'Comment', sub: 'Opens the composer' });
  items.push({ id: 'open-github', label: 'Open on GitHub' }, ...linkItems(ctx));
  return items;
}

function botItem(ctx: ActionContext, b: BotSettings): ActionItem {
  if (ctx.withBot) return { id: 'hand-bot', label: `With ${b.name}`, disabled: botHeld(b), dashed: true };
  return {
    id: 'hand-bot',
    label: `Hand to ${b.name}`,
    sub: `Adds the ${b.label} label. Asks to confirm`,
    confirm: true,
    disabled: !ctx.issueOpen ? 'Issue is closed' : ctx.busy ? 'Working...' : undefined,
  };
}

/** Check and Trim rows. Hidden while the bot is off; Trim only when the newest verdict offers it. */
function botCheckItems(ctx: ActionContext): ActionItem[] {
  const b = bot();
  const s = ctx.botState;
  if (!b.enabled || !s || s.check === 'hidden') return [];
  const items: ActionItem[] = [];
  if (s.trim === 'pending') {
    items.push({ id: 'bot-trim', label: 'Trimming...', disabled: `Waiting for ${b.name}`, dashed: true });
  } else if (s.trim === 'offered' && s.trimCount !== undefined) {
    items.push({ id: 'bot-trim', label: `Trim met criteria (${s.trimCount})`, sub: `Posts ${trimCommand(b)}. No model runs` });
  }
  const sub = `Posts ${checkCommand(b)}. ${b.name} changes nothing`;
  if (s.check === 'pending') items.push({ id: 'bot-check', label: 'Checking...', disabled: `Waiting for ${b.name}`, dashed: true });
  else if (s.check === 'verdict') items.push({ id: 'bot-check', label: 'Check again', sub });
  else items.push({ id: 'bot-check', label: `Check with ${b.name}`, sub });
  return items;
}

function issueItems(ctx: ActionContext): ActionItem[] {
  const items: ActionItem[] = botCheckItems(ctx);
  const current = ctx.status ?? statusOption('backlog');
  if (!ctx.issueOpen) items.push({ id: 'reopen', label: 'Reopen', sub: 'Opens the issue again' });
  else if (ctx.projectStatus) {
    items.push(
      current === statusOption('inProgress')
        ? { id: 'stop-work', label: 'Stop work', sub: `Sets Status back to ${statusOption('ready')}` }
        : { id: 'start-work', label: 'Start work', sub: `Assigns you, sets ${statusOption('inProgress')}` },
    );
  } else if (!ctx.assignedToViewer) items.push({ id: 'start-work', label: 'Start work', sub: 'Assigns you' });
  if (ctx.botRetry === 'offered') {
    items.push({ id: 'bot-retry', label: `Retry ${bot().name}`, sub: `Posts ${retryCommand(bot())}. ${bot().name} reruns from the start` });
  } else if (ctx.botRetry === 'pending') {
    items.push({ id: 'bot-retry', label: 'Retry requested', disabled: `Waiting for ${bot().name}` });
  }
  const split = ctx.botSplit;
  if (split?.state === 'offered') {
    const n = split.parts;
    items.push({ id: 'bot-split', label: 'Split', sub: `Previews ${n} ${n === 1 ? 'part' : 'parts'}, then posts ${splitCommand(bot())}`, opens: true });
  } else if (split?.state === 'pending') {
    items.push({ id: 'bot-split', label: 'Split requested', disabled: `Waiting for ${bot().name}` });
  } else if (split?.state === 'held') {
    items.push({ id: 'bot-split', label: 'Split', disabled: splitHeld(bot()), dashed: true });
  }
  items.push({ id: 'edit-title', label: 'Edit title', sub: 'Renames the issue' });
  if (ctx.repo && ctx.number !== undefined) {
    items.push({ id: 'new-sub-issue', label: 'Create sub-issue', sub: `Adds to ${repoLabel(ctx.repo)} #${ctx.number}`, opens: true });
  }
  if (ctx.orcaAvailable) {
    items.push({ id: 'dispatch', label: 'Dispatch with Orca', sub: 'Asks to confirm first', confirm: true });
  }
  const b = bot();
  if (b.enabled) items.push(botItem(ctx, b));
  if (!ctx.assignedToViewer) items.push({ id: 'assign-me', label: 'Assign me', sub: 'Adds you as assignee' });
  items.push({ id: 'comment', label: 'Comment', sub: 'Opens the composer' });
  items.push({ id: 'new-issue', label: 'New issue', sub: `In ${ctx.repo ?? 'this repo'}`, opens: true });
  if (ctx.issueOpen) {
    items.push({ id: 'close-completed', label: 'Completed' });
    items.push({ id: 'close-not-planned', label: 'Not planned' });
  }
  if (ctx.projectStatus) {
    for (const s of projectStatuses()) {
      items.push({ id: `status:${s}`, label: s, ...(s === current ? { disabled: 'Current' } : {}) });
    }
  }
  items.push(...linkItems(ctx));
  return items;
}

/** Follow-up rows of the newest verdict get emphasis: Close as completed, Not planned, Hand to <bot>. */
function emphasise(items: ActionItem[], ctx: ActionContext): ActionItem[] {
  const s = ctx.botState;
  const verdict = s?.check === 'verdict' ? s.card?.verdict : undefined;
  if (!verdict) return items;
  const e = emphasisFor(verdict);
  return items.map((i) => {
    if (i.id === 'close-completed' && e.close) return { ...i, emphasis: 'primary' };
    if (i.id === 'close-not-planned' && e.notPlanned) return { ...i, emphasis: 'neutral' };
    if (i.id === 'hand-bot' && e.hand && !ctx.withBot) return { ...i, emphasis: 'primary' };
    return i;
  });
}

/** Rows in display order. Offline turns every write row off; the link rows always work. */
export function actionItems(ctx: ActionContext): ActionItem[] {
  const items = ctx.target === 'pr' ? prItems(ctx) : emphasise(issueItems(ctx), ctx);
  if (!ctx.writesOff) return items;
  return items.map((i) => (LINK_IDS.includes(i.id) ? i : { ...i, disabled: i.disabled ?? OFFLINE }));
}
