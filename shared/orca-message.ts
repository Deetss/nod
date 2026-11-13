import { SEND_MAX } from './orca-sessions';

/** Every message Nod sends starts with this, so the agent can tell it from the user's own typing. */
export const MESSAGE_TAG = '[nod]';
export const AUTO_PREFIX = `${MESSAGE_TAG} FYI, no action needed:`;
/** A merge asks the session to wrap up, so its message drops the FYI wording. */
export const MERGE_PREFIX = MESSAGE_TAG;
export const WRAP_UP = 'Finish any follow-up for it, then run /compress to wrap up.';
export const FIRST_LINE_MAX = 160;
export const TITLE_MAX = 60;
/** GitHub-supplied strings in a prefill are cut to this. */
export const FIELD_MAX = 40;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** Control characters become spaces, runs of space collapse, ends are trimmed. One line out. */
export function oneLine(s: string): string {
  return s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

/** A GitHub string made safe for a message: one line, no backticks, cut to `max`. */
export function cleanField(s: string, max: number = FIELD_MAX): string {
  return oneLine(s.replace(/`/g, '')).slice(0, max).trim();
}

/** A login or repo name. Anything outside the GitHub alphabet is dropped. */
function ident(s: string, max = 60): string {
  return s.replace(/[^A-Za-z0-9._\-[\]]/g, '').slice(0, max);
}

/** A full `owner/name` repo, each part cleaned on its own so the single slash survives. */
function identRepo(repo: string): string {
  if (!repo.includes('/')) return ident(repo, 100);
  const [owner = '', name = ''] = repo.split('/');
  return `${ident(owner)}/${ident(name, 100)}`;
}

export type OrcaEventKind =
  | 'approve'
  | 'request-changes'
  | 'comment'
  | 'merge'
  | 'admin-merge'
  | 'auto-merge-on'
  | 'auto-merge-off'
  | 'ready'
  | 'issue-close'
  | 'issue-reopen';

export interface EventContext {
  repo: string;
  number: number;
  /** The viewer's login. */
  actor: string;
  method?: 'squash' | 'merge';
  reason?: 'completed' | 'not-planned';
  /** Used only when `includeTitle` is set. */
  title?: string;
}

/** Word for the toast and the Activity entry: `Notified crew-1355 (approved)`. */
export const EVENT_WORD: Record<OrcaEventKind, string> = {
  approve: 'approved',
  'request-changes': 'changes requested',
  comment: 'commented',
  merge: 'merged',
  'admin-merge': 'admin merged',
  'auto-merge-on': 'auto-merge on',
  'auto-merge-off': 'auto-merge off',
  ready: 'ready for review',
  'issue-close': 'closed',
  'issue-reopen': 'reopened',
};

export const isIssueEvent = (kind: OrcaEventKind): boolean => kind === 'issue-close' || kind === 'issue-reopen';
export const isMergeEvent = (kind: OrcaEventKind): boolean => kind === 'merge' || kind === 'admin-merge';

/** How an automatic message for `kind` starts. Always `MESSAGE_TAG` first. */
export const autoPrefix = (kind: OrcaEventKind): string => (isMergeEvent(kind) ? MERGE_PREFIX : AUTO_PREFIX);

/** The PR or issue page, built from the full repo and number, never from GitHub text. */
export function itemUrl(kind: OrcaEventKind, c: Pick<EventContext, 'repo' | 'number'>): string {
  return `https://github.com/${identRepo(c.repo)}/${isIssueEvent(kind) ? 'issues' : 'pull'}/${c.number}`;
}

function sentence(kind: OrcaEventKind, c: EventContext): string {
  const repo = identRepo(c.repo);
  const actor = ident(c.actor) || 'someone';
  const pr = `${repo} #${c.number}`;
  switch (kind) {
    case 'approve':
      return `${pr} was approved by ${actor}.`;
    case 'request-changes':
      return `${pr} had changes requested by ${actor}. The comments are on GitHub.`;
    case 'comment':
      return `${actor} commented on ${pr}. The text is on GitHub.`;
    case 'merge':
      return `${pr} was merged by ${actor}${c.method ? ` (${c.method})` : ''}.`;
    case 'admin-merge':
      return `${pr} was admin merged by ${actor}.`;
    case 'auto-merge-on':
      return `Auto-merge was turned on for ${pr} by ${actor}.`;
    case 'auto-merge-off':
      return `Auto-merge was turned off for ${pr} by ${actor}.`;
    case 'ready':
      return `${pr} was marked ready for review by ${actor}.`;
    case 'issue-close':
      return `${repo} issue #${c.number} was closed as ${c.reason === 'not-planned' ? 'not planned' : 'completed'} by ${actor}.`;
    case 'issue-reopen':
      return `${repo} issue #${c.number} was reopened by ${actor}.`;
  }
}

/**
 * The automatic message: a fixed sentence on the first line (at most 160 characters) and the link on the
 * second. A merge adds `WRAP_UP`. A PR title appears only when `includeTitle` is set and it is 60
 * characters or fewer.
 */
export function buildEventMessage(kind: OrcaEventKind, c: EventContext, includeTitle = false): string {
  const wrapUp = isMergeEvent(kind) ? ` ${WRAP_UP}` : '';
  let first = `${autoPrefix(kind)} ${sentence(kind, c)}${wrapUp}`;
  const title = includeTitle && c.title ? cleanField(c.title, TITLE_MAX + 1) : '';
  if (title !== '' && title.length <= TITLE_MAX) {
    const withTitle = `${first} Title: "${title}"`;
    if (withTitle.length <= FIRST_LINE_MAX) first = withTitle;
  }
  return `${first.slice(0, FIRST_LINE_MAX)}\n${itemUrl(kind, c)}`;
}

/**
 * Text for a user-typed send: one line, no control characters, tagged, at most `SEND_MAX` characters.
 * Returns undefined when nothing is left to send.
 */
export function prepareSend(text: string, max: number = SEND_MAX): string | undefined {
  const body = oneLine(text);
  if (body === '') return undefined;
  const tagged = body.startsWith(MESSAGE_TAG) ? body : `${MESSAGE_TAG} ${body}`;
  return tagged.length > max ? undefined : tagged;
}

/** An automatic message is two lines. Control characters go, newlines stay between the lines. */
export function prepareAuto(message: string): string {
  return message
    .split('\n')
    .map(oneLine)
    .filter((l) => l !== '')
    .join('\n');
}

/** The facts a dialog prefill reads. All counts, names and links. */
export interface PrefillFacts {
  repo: string;
  number: number;
  headRef: string;
  baseRef: string;
  conflicting: boolean;
  ci: 'pass' | 'fail' | 'running' | 'none';
  /** Names of failing checks, in order. */
  failing: readonly string[];
  checkTotal: number;
  /** Login of the latest reviewer who requested changes. */
  changesBy?: string;
  changesRequested: boolean;
  openThreads: number;
}

export type PrefillChip = 'review' | 'ci' | 'conflicts' | 'blank';

export interface PrefillOption {
  chip: PrefillChip;
  label: string;
  /** Absent when the chip has nothing to fill; then `why` says so. */
  text?: string;
  /** What the text was filled from, e.g. `changes requested by acme-dev, 2 open threads`. */
  from?: string;
  why?: string;
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The four chips of the Send message dialog, in order. The first enabled one is active on open. */
export function prefillOptions(f: PrefillFacts): PrefillOption[] {
  const ref = `${identRepo(f.repo)} #${f.number}`;
  const url = `https://github.com/${identRepo(f.repo)}/pull/${f.number}`;
  const out: PrefillOption[] = [];

  const reviewOn = f.changesRequested || f.openThreads > 0;
  const who = f.changesBy ? `changes requested by ${ident(f.changesBy)}` : 'review comments';
  out.push({
    chip: 'review',
    label: 'Review comment',
    ...(reviewOn
      ? {
          text:
            `${MESSAGE_TAG} Please look at the review on ${ref} (${who}, ${plural(f.openThreads, 'open thread')}). ` +
            `Comments: ${url}`,
          from: `${who}, ${plural(f.openThreads, 'open thread')}`,
        }
      : { why: 'Review comment is off: no changes requested or open threads.' }),
  });

  const first = f.failing[0] ? cleanField(f.failing[0]) : '';
  out.push({
    chip: 'ci',
    label: 'CI failed',
    ...(f.ci === 'fail' && first !== ''
      ? {
          text:
            `${MESSAGE_TAG} CI failed on ${ref}: check "${first}" failed (${f.failing.length} of ${plural(f.checkTotal, 'check')}). ` +
            `Please read the log and fix it. ${url}/checks`,
          from: `${plural(f.failing.length, 'failing check')}`,
        }
      : { why: 'CI failed is off: CI is not failing.' }),
  });

  out.push({
    chip: 'conflicts',
    label: 'Conflicts',
    ...(f.conflicting
      ? {
          text:
            `${MESSAGE_TAG} ${ref} has merge conflicts with ${cleanField(f.baseRef)}. ` +
            `Please merge ${cleanField(f.baseRef)} into ${cleanField(f.headRef, 80)} and resolve them. ${url}`,
          from: `merge conflicts with ${cleanField(f.baseRef)}`,
        }
      : { why: 'Conflicts is off: this PR has none.' }),
  });

  out.push({ chip: 'blank', label: 'Blank', text: `${MESSAGE_TAG} ` });
  return out;
}

/** The chip to select when the dialog opens: the first with text. */
export function firstPrefill(options: readonly PrefillOption[]): PrefillOption | undefined {
  return options.find((o) => o.text !== undefined);
}
