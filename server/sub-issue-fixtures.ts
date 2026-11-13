import type { SubIssueAction } from '../shared/issue-types';
import { applyMove } from '../shared/sub-issues';
import type { Seed } from './issue-fixtures';
import { BOT_CHILDREN } from './bot-fixtures';
import { FIXTURE_VIEWER } from './fixture-data';

/** Parents and children for the sub-issues mockup (`docs/design/sub-issues-spec.md`). */

const LONG_TITLE =
  'Export fails for communities with more than 400 units when the elevation photo set mixes HEIC and JPEG files from the field, and the retry loop never stops';

const closedSeed = (repo: string, number: number, title: string, assignee?: string): Seed => ({
  repo,
  number,
  title,
  author: 'build-bot',
  ageH: 120 + number,
  openedH: 300 + number,
  labels: [],
  assignees: assignee ? [assignee] : [],
  comments: 0,
  seen: 'seen',
  closed: 'completed',
});

export const SUB_ISSUE_SAMPLES: Seed[] = [
  {
    repo: 'acme-dev/notes',
    number: 12,
    title: 'Rebuild the banner export pipeline',
    author: FIXTURE_VIEWER,
    ageH: 1.5,
    openedH: 144,
    labels: ['enhancement'],
    assignees: [FIXTURE_VIEWER],
    comments: 3,
    seen: 'seen',
    status: 'In progress',
    body:
      '<p>Exports render inside the web request and time out on large communities. Move rendering to a worker queue, ' +
      'cache community logos between runs, and fill the elevation photo gaps.</p>',
  },
  closedSeed('acme-dev/notes', 14, 'Move export rendering to a worker queue', 'build-bot'),
  closedSeed('acme-dev/notes', 15, 'Cache community logos between exports', 'build-bot'),
  { repo: 'acme-co/acme-api', number: 421, title: 'Expose the elevation photo URL on the unit endpoint', author: FIXTURE_VIEWER, ageH: 30, openedH: 120, labels: [], assignees: [FIXTURE_VIEWER], comments: 0, seen: 'seen' },
  { repo: 'acme-dev/notes', number: 9, title: 'Community banner sizes for the new MLS feed', author: FIXTURE_VIEWER, ageH: 216, openedH: 400, labels: [], assignees: [], comments: 1, seen: 'seen', status: 'Ready' },
  closedSeed('acme-dev/notes', 5, 'Measure the banner sizes the MLS feed accepts'),
  closedSeed('acme-dev/notes', 6, 'Add MLS banner size presets', FIXTURE_VIEWER),
  closedSeed('acme-dev/notes', 7, 'Crop banners to the MLS aspect ratio', 'build-bot'),
  closedSeed('acme-dev/notes', 8, 'Document the MLS banner sizes'),
  { repo: 'acme-co/acme-api', number: 399, title: 'Record the approver on each ACPR step', author: 'build-bot', ageH: 150, openedH: 190, labels: [], assignees: [], comments: 0, seen: 'seen' },
  { repo: 'acme-co/acme-api', number: 400, title: 'Show the ACPR audit trail on the unit page', author: 'build-bot', ageH: 152, openedH: 190, labels: [], assignees: [], comments: 0, seen: 'seen' },
  { repo: 'acme-co/acme-web', number: 301, title: 'Unit map pins overlap at high zoom', author: 'build-bot', ageH: 288, openedH: 500, labels: [], assignees: [], comments: 0, seen: 'seen', status: 'Backlog' },
  {
    repo: 'acme-co/acme-web',
    number: 250,
    title: 'Rebuild the banner export pipeline so every community renders on a worker, with logos cached and elevation photo gaps filled',
    author: FIXTURE_VIEWER,
    ageH: 320,
    openedH: 700,
    labels: [],
    assignees: [],
    comments: 0,
    seen: 'seen',
  },
  { repo: 'acme-dev/notes', number: 23, title: LONG_TITLE, author: 'build-bot', ageH: 60, openedH: 60, labels: [], assignees: [], comments: 0, seen: 'seen' },
  {
    repo: 'acme-dev/notes',
    number: 24,
    title: 'Convert HEIC elevation photos to JPEG before the worker renders the export for communities with more than 400 units',
    author: 'build-bot',
    ageH: 58,
    openedH: 58,
    labels: [],
    assignees: [FIXTURE_VIEWER],
    comments: 0,
    seen: 'seen',
  },
  { repo: 'acme-co/acme-api', number: 422, title: 'Expose the elevation photo set on the unit endpoint', author: 'build-bot', ageH: 59, openedH: 59, labels: [], assignees: [FIXTURE_VIEWER], comments: 0, seen: 'seen' },
  { repo: 'acme-dev/notes', number: 19, title: 'Banner export filename uses the unit number', author: 'build-bot', ageH: 50, openedH: 80, labels: [], assignees: [], comments: 0, seen: 'seen' },
  { repo: 'acme-co/acme-api', number: 433, title: 'Export job retries forever on a missing elevation photo', author: 'build-bot', ageH: 70, openedH: 90, labels: ['bug'], assignees: [], comments: 0, seen: 'seen' },
];

/** Parent `repo#number` to children in rank order. */
const CHILDREN: Record<string, string[]> = {
  'acme-dev/notes#12': ['acme-dev/notes#14', 'acme-dev/notes#17', 'acme-dev/notes#15', 'acme-co/acme-api#421', 'acme-dev/notes#10'],
  'acme-co/acme-api#398': ['acme-co/acme-api#399', 'acme-co/acme-api#400'],
  'acme-dev/notes#9': ['acme-dev/notes#5', 'acme-dev/notes#6', 'acme-dev/notes#7', 'acme-dev/notes#8'],
  'acme-co/acme-web#250': ['acme-co/acme-web#288', 'acme-dev/notes#23'],
  'acme-dev/notes#23': ['acme-dev/notes#24', 'acme-co/acme-api#422'],
};

const idOf = (key: string): string => `I_${key.replace('#', '_')}`;

/** Parent and child links by issue id, with the writes the sub-issue actions make. */
export class SubTree {
  private readonly kids = new Map<string, string[]>();

  constructor() {
    for (const [parent, children] of Object.entries({ ...CHILDREN, ...BOT_CHILDREN })) {
      this.kids.set(idOf(parent), children.map(idOf));
    }
  }

  children(parentId: string): string[] {
    return this.kids.get(parentId) ?? [];
  }

  parentOf(childId: string): string | undefined {
    for (const [parent, children] of this.kids) if (children.includes(childId)) return parent;
    return undefined;
  }

  /** Links a child at the end, moving it from its old parent only when `replace` allows it. */
  add(parentId: string, childId: string, replace: boolean): void {
    const old = this.parentOf(childId);
    if (old === parentId) throw new Error('Already a sub-issue of this issue');
    if (old && !replace) throw new Error('Issue already has a parent');
    if (old) this.remove(old, childId);
    this.kids.set(parentId, [...this.children(parentId), childId]);
  }

  remove(parentId: string, childId: string): void {
    this.kids.set(parentId, this.children(parentId).filter((id) => id !== childId));
  }

  move(parentId: string, a: Extract<SubIssueAction, { type: 'sub-move' }>): void {
    const args = a.afterId !== undefined ? { afterId: a.afterId } : { beforeId: a.beforeId ?? '' };
    const items = this.children(parentId).map((id) => ({ id }));
    this.kids.set(parentId, applyMove(items, a.childId, args).map((i) => i.id));
  }
}
