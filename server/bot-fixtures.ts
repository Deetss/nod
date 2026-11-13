import { botTag, checkFailedText, retryMarker, trimMarker, trimRefusedMarker } from '../shared/bot';
import type { IssueComment } from '../shared/issue-types';
import type { BotSettings } from '../shared/settings';
import type { Seed } from './issue-fixtures';
import { FIXTURE_VIEWER } from './fixture-data';

/** The bot the fixture threads belong to. Fixtures tag their own comments with it, whatever the app's settings say. */
export const FIXTURE_BOT: BotSettings = {
  enabled: true,
  name: 'Helper',
  command: '/helper',
  label: 'helper-bot',
  labelColor: '1f6feb',
  login: 'helper-bot',
  marker: 'helper',
};

const RETRY = retryMarker(FIXTURE_BOT);

/** Issues whose threads exercise the bot Retry and Split buttons. */

const seed = (number: number, title: string, comments: number, ageH: number): Seed => ({
  repo: 'acme-co/acme-api',
  number,
  title,
  author: FIXTURE_VIEWER,
  ageH,
  openedH: 30,
  labels: ['helper-bot'],
  assignees: [],
  comments,
  seen: 'seen',
});

export const BOT_SAMPLES: Seed[] = [
  seed(441, 'Unit export skips communities without a PM', 2, 0.5),
  seed(442, 'Plot plan upload rejects large PDFs', 3, 1),
  seed(443, 'ACPR approvals list repeats the last step', 3, 1.5),
  seed(444, 'Rebuild unit document approvals end to end', 2, 0.75),
  seed(445, 'Move M-Files sync onto a background queue', 2, 1.25),
  seed(446, 'Rework the community color sheet export', 2, 1.75),
  seed(447, 'Check: the unit filter change is ready to hand over', 2, 2),
  seed(448, 'Check: the plot plan preview is still pending', 1, 2.5),
  seed(449, 'Check: the approval step copy is partly done', 2, 3),
  seed(450, 'Check: the export header is partly done, no criteria listed', 2, 3.5),
  seed(451, 'Check: the community sheet is already done', 2, 4),
  seed(452, 'Check: the legacy CSV importer is obsolete', 2, 4.5),
  seed(453, 'Check: the sidebar wording has no clear target', 2, 5),
  seed(454, 'Check: the bulk approve check failed to run', 2, 5.5),
  seed(455, 'Check: the unit status trim is refused', 2, 6),
  seed(456, 'Check: the sizing notes trim moved two criteria', 2, 6.5),
];

/**
 * Author, age in hours, visible text, the hidden marker GitHub's bodyHTML drops, and an optional
 * absolute ISO time that replaces the age (checks with `met` need a time after the cutoff).
 */
export type BotThreadComment = [string, number, string, string?, string?];

const POST_CUTOFF = new Date(2026, 10, 12, 22, 30).toISOString();
const PRE_CUTOFF = new Date(2026, 10, 12, 21, 0).toISOString();
const BOT = FIXTURE_BOT.login;
const check = (verdict: string) => `<!-- ${FIXTURE_BOT.marker}:check ${verdict} -->`;

/** A split marker as the bot writes it: base64 JSON of `{title, acceptance_criteria}` parts. */
export const splitMarker = (parts: { title: string; acceptance_criteria: string[] }[], b: BotSettings): string =>
  `<!-- ${b.marker}:split ${Buffer.from(JSON.stringify(parts)).toString('base64')} -->`;

const FAILED_SIZING =
  'Helper could not size this issue: the sizing model timed out. Comment /helper retry to run Helper again from the start.';
const FAILED_BRANCH =
  'Helper could not open a branch: GitHub returned 502 while creating it. Comment /helper retry to run Helper again.';
const SIZED = 'Helper estimates this at 4 files, about 120 changed lines. Starting work.';
const TOO_BROAD =
  'Helper estimates this at 31 files, too broad for one change. Comment /helper split to open these as sub-issues of this one, then label each part helper-bot when it is ready to start.';

export const SPLIT_PARTS = [
  {
    title: 'Store approval steps for unit documents',
    acceptance_criteria: ['Each unit document has an ordered list of approval steps', 'A migration backfills existing approvals'],
  },
  {
    title: 'Approve or reject a lot document step in the API',
    acceptance_criteria: ['Only the step owner can approve', 'A rejection returns the document to the CM with a note'],
  },
  {
    title: 'Show unit document approvals on the unit page',
    acceptance_criteria: ['Each step shows its owner and state', 'The PM sees pending steps first'],
  },
];

export const BOT_THREADS: Record<string, BotThreadComment[]> = {
  // Newest bot comment carries the marker: Retry shows.
  'I_acme-co/acme-api_441': [
    [FIXTURE_VIEWER, 3, 'Handing this to Helper.'],
    [FIXTURE_BOT.login, 1, FAILED_SIZING, RETRY],
  ],
  // Marker on an older bot comment, then a newer one without it: Retry hides.
  'I_acme-co/acme-api_442': [
    [FIXTURE_VIEWER, 6, 'Handing this to Helper.'],
    [FIXTURE_BOT.login, 5, FAILED_BRANCH, RETRY],
    [FIXTURE_BOT.login, 2, SIZED],
  ],
  // A human comment after the marked bot comment: Retry still shows.
  'I_acme-co/acme-api_443': [
    [FIXTURE_BOT.login, 4, FAILED_SIZING, RETRY],
    ['build-bot', 2, 'Saw the timeout on the sizing model. It is back up now.'],
    [FIXTURE_VIEWER, 1.5, 'Thanks, will retry.'],
  ],
  // The bot proposes three parts: Split shows.
  'I_acme-co/acme-api_444': [
    [FIXTURE_VIEWER, 3, 'Handing this to Helper.'],
    [FIXTURE_BOT.login, 1, TOO_BROAD, splitMarker(SPLIT_PARTS, FIXTURE_BOT)],
  ],
  // The marker does not decode: no Split, one warning.
  'I_acme-co/acme-api_445': [
    [FIXTURE_VIEWER, 3, 'Handing this to Helper.'],
    [FIXTURE_BOT.login, 1, TOO_BROAD, '<!-- helper:split bm90IGpzb24= -->'],
  ],
  // A valid marker, but the issue already has a sub-issue: the held line shows.
  'I_acme-co/acme-api_446': [
    [FIXTURE_VIEWER, 3, 'Handing this to Helper.'],
    [FIXTURE_BOT.login, 1, TOO_BROAD, splitMarker(SPLIT_PARTS.slice(0, 2), FIXTURE_BOT)],
  ],
  // A check verdict for each word. The ack is posted, then edited into the verdict in place.
  'I_acme-co/acme-api_447': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: valid.** Hand this to Helper to start.', check('valid')],
  ],
  // The ack with no marker yet: the check is still running.
  'I_acme-co/acme-api_448': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 0.05, '**Helper check: checking.** Reading the issue against its acceptance criteria.'],
  ],
  // The verdict carries met: the Trim follow-up shows with a count of 2.
  'I_acme-co/acme-api_449': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: partly.** Criteria 1 and 3 are in the code already.', `<!-- ${FIXTURE_BOT.marker}:check partly met=1,3 -->`, POST_CUTOFF],
  ],
  // Older than the cutoff: the verdict has no met, so no Trim follow-up.
  'I_acme-co/acme-api_450': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: partly.** Two criteria are still open.', check('partly'), PRE_CUTOFF],
  ],
  'I_acme-co/acme-api_451': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: done.** Every criterion is in place.', check('done')],
  ],
  'I_acme-co/acme-api_452': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: obsolete.** The importer was removed in the last release.', check('obsolete')],
  ],
  'I_acme-co/acme-api_453': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: unclear.** The issue does not say which sidebar it means.', check('unclear')],
  ],
  // The failed check: the text with no marker.
  'I_acme-co/acme-api_454': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, `${checkFailedText(FIXTURE_BOT)}: the model timed out. Comment /helper check to run it again.`],
  ],
  // A met verdict, then a trim the bot refuses.
  'I_acme-co/acme-api_455': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: partly.** Criteria 1 and 3 are in the code already.', `<!-- ${FIXTURE_BOT.marker}:check partly met=1,3 -->`, POST_CUTOFF],
    [FIXTURE_VIEWER, 1.5, 'Trim the met criteria.'],
    [BOT, 1, 'Helper could not match any criteria to the Already done section. Nothing moved.', trimRefusedMarker(FIXTURE_BOT), new Date(2026, 10, 12, 22, 45).toISOString()],
  ],
  // A met verdict, then a trim that moved two criteria. The body carries the Already done section.
  'I_acme-co/acme-api_456': [
    [FIXTURE_VIEWER, 3, 'Helper check this, please.'],
    [BOT, 2, '**Helper check: partly.** Criteria 1 and 3 are in the code already.', `<!-- ${FIXTURE_BOT.marker}:check partly met=1,3 -->`, POST_CUTOFF],
    [FIXTURE_VIEWER, 1.5, 'Trim the met criteria.'],
    [BOT, 1, 'Helper moved 2 criteria into Already done.', trimMarker(FIXTURE_BOT, 2), new Date(2026, 10, 12, 22, 45).toISOString()],
  ],
};

/** The child that keeps #446 from being split. */
export const BOT_CHILDREN: Record<string, string[]> = {
  'acme-co/acme-api#446': ['acme-co/acme-api#433'],
};

/** Tags a fixture comment the way `issue-map` tags a GitHub one, from its author, Markdown body and time. */
export function botFixtureTag([author, , text, marker]: BotThreadComment, createdAt: string): Pick<IssueComment, 'bot'> {
  const isBot = author === FIXTURE_BOT.login;
  const tag = botTag({ __typename: isBot ? 'Bot' : 'User', login: author }, marker ? `${text}\n\n${marker}` : text, FIXTURE_BOT, createdAt);
  return tag ? { bot: tag } : {};
}
