import { DEFAULT_SETTINGS } from '../shared/settings';
import { repoName } from '../shared/repo-name';
import type { CiState, DiffFile, DiffLine, Hunk, PrSummary } from '../shared/types';

/** Synthetic sample data. Authors are limited to the fixture viewer, build-bot and dependabot[bot]. */

/** Two owners, so the mixed case shows: an org and the viewer's own login. */
export const FIXTURE_ORG = 'acme-co';
export const FIXTURE_VIEWER = 'acme-dev';

const HOUR = 3_600_000;

interface PrSeed {
  repo: string;
  number: number;
  title: string;
  author: string;
  ageH: number;
  add: number;
  del: number;
  files: number;
  ci: CiState;
  review: string;
  seen: PrSummary['seen'];
  note?: string;
  commits?: number;
  draft?: boolean;
  conflicting?: boolean;
}

/** Issues a fixture PR closes, for the possible Orca matches. */
const CLOSES: Record<string, number[]> = { 'acme-co/acme-api#309': [412] };

/** Mirrors the head refs the fixture provider reports in PR detail. */
function headRefOf(s: PrSeed): string {
  if (s.title.toLowerCase().includes(DEFAULT_SETTINGS.releaseMerge.titleContains)) return DEFAULT_SETTINGS.releaseMerge.head;
  return s.repo === 'acme-co/acme-api' && s.number === 310 ? 'crew/acmeapi-data-read-bonus' : `feature/${s.number}`;
}

function summary(s: PrSeed, now: number): PrSummary {
  const at = new Date(now - s.ageH * HOUR).toISOString();
  const closes = CLOSES[`${s.repo}#${s.number}`];
  return {
    id: `PR_${s.repo}_${s.number}`,
    repo: s.repo,
    number: s.number,
    title: s.title,
    author: s.author,
    createdAt: at,
    updatedAt: at,
    headSha: `e4f5g6h${s.number}`,
    additions: s.add,
    deletions: s.del,
    changedFiles: s.files,
    commitCount: s.commits ?? 1,
    ci: s.ci,
    reviewStatus: s.review,
    seen: s.seen,
    updatedNote: s.note,
    isDraft: s.draft ?? false,
    ...(s.conflicting ? { conflicting: true } : {}),
    headRef: headRefOf(s),
    ...(closes ? { closes } : {}),
    url: `https://github.com/${s.repo}/pull/${s.number}`,
  };
}

const bot = 'dependabot[bot]';

const NEEDS: PrSeed[] = [
  { repo: 'acme-co/acme-api', number: 310, title: 'fix: hide sale bonus from data:read', author: 'build-bot', ageH: 2, add: 42, del: 8, files: 4, ci: 'pass', review: 'needs review', seen: 'updated', note: '2 commits since you looked', commits: 5, conflicting: true },
];
const MINE: PrSeed[] = [
  { repo: 'acme-co/acme-web', number: 1343, title: 'feat: release staging to main (2026-11-06)', author: FIXTURE_VIEWER, ageH: 5, add: 1284, del: 312, files: 38, ci: 'running', review: 'no reviews yet', seen: 'new', conflicting: true },
  { repo: 'acme-co/acme-api', number: 307, title: 'feat: release staging to main (2026-11-06)', author: FIXTURE_VIEWER, ageH: 5, add: 96, del: 14, files: 11, ci: 'pass', review: '1 approval', seen: 'seen' },
  { repo: 'acme-co/acme-web', number: 1352, title: 'feat: color sheet print layout', author: FIXTURE_VIEWER, ageH: 3, add: 214, del: 38, files: 9, ci: 'pass', review: 'no reviews yet', seen: 'seen', draft: true },
];
const ORG: PrSeed[] = [
  { repo: 'acme-co/acme-api', number: 309, title: 'chore: tidy swagger tags', author: 'build-bot', ageH: 8, add: 12, del: 12, files: 2, ci: 'pass', review: 'no reviews yet', seen: 'seen' },
  { repo: 'acme-co/acme-web', number: 1341, title: 'fix: unit filter keeps scroll position', author: 'mlopez', ageH: 9, add: 31, del: 10, files: 3, ci: 'pass', review: '1 approval', seen: 'seen' },
  { repo: 'acme-co/acme-web', number: 1340, title: 'feat: color sheet export button', author: 'build-bot', ageH: 12, add: 88, del: 4, files: 5, ci: 'fail', review: 'needs review', seen: 'seen', conflicting: true },
  { repo: 'acme-dev/notes', number: 41, title: 'fix: keep selections when the form re-renders', author: 'mlopez', ageH: 20, add: 22, del: 9, files: 2, ci: 'pass', review: 'no reviews yet', seen: 'seen' },
  { repo: 'acme-co/acme-api', number: 305, title: 'perf: index unit_sales on community_id', author: 'build-bot', ageH: 26, add: 18, del: 0, files: 2, ci: 'pass', review: 'needs review', seen: 'seen' },
  { repo: 'acme-dev/tools', number: 12, title: 'feat: log inbound vendor calls', author: 'mlopez', ageH: 30, add: 140, del: 21, files: 6, ci: 'pass', review: 'no reviews yet', seen: 'seen' },
  { repo: 'acme-dev/tools', number: 11, title: 'fix: reject unsigned vendor payloads', author: 'build-bot', ageH: 44, add: 54, del: 6, files: 3, ci: 'pass', review: '1 approval', seen: 'seen' },
  { repo: 'acme-co/acme-web', number: 1338, title: 'chore: remove unused plot plan icons', author: 'mlopez', ageH: 52, add: 2, del: 64, files: 9, ci: 'pass', review: 'no reviews yet', seen: 'seen' },
  { repo: 'acme-co/acme-api', number: 301, title: 'docs: describe the ACPR approval chain', author: 'mlopez', ageH: 70, add: 48, del: 0, files: 1, ci: 'pass', review: 'no reviews yet', seen: 'seen' },
];
const DEPENDABOT: PrSeed[] = [
  { repo: 'acme-dev/notes', number: 40, title: 'chore(deps): bump solid_queue from 1.5.0 to 1.7.2', author: bot, ageH: 24, add: 6, del: 6, files: 2, ci: 'pass', review: 'no reviews yet', seen: 'new' },
  { repo: 'acme-dev/notes', number: 39, title: 'chore(deps): bump grover from 1.2.10 to 2.0.0', author: bot, ageH: 48, add: 9, del: 9, files: 2, ci: 'fail', review: 'no reviews yet', seen: 'seen' },
  { repo: 'acme-dev/notes', number: 38, title: 'chore(deps): bump solid_cable from 3.0.12 to 4.1.0', author: bot, ageH: 72, add: 7, del: 5, files: 2, ci: 'pass', review: 'no reviews yet', seen: 'seen' },
];

export interface FixtureSections {
  needs: PrSummary[];
  mine: PrSummary[];
  org: PrSummary[];
  dependabot: PrSummary[];
}

export function fixtureSections(now: number): FixtureSections {
  const map = (seeds: PrSeed[]) => seeds.map((s) => summary(s, now));
  return { needs: map(NEEDS), mine: map(MINE), org: map(ORG), dependabot: map(DEPENDABOT) };
}

type Row = [DiffLine['kind'], number | null, number | null, string];

function hunk(header: string, rows: Row[]): Hunk {
  return {
    header,
    lines: rows.map(([kind, o, n, text]) => ({
      kind,
      oldNo: o ?? undefined,
      newNo: n ?? undefined,
      text,
    })),
  };
}

const specHunk1 = hunk('@@ -37,9 +37,17 @@ RSpec.describe "data:read token" do', [
  ['ctx', 37, 37, '  let(:sale) { create(:unit_sale) }'],
  ['ctx', 38, 38, ''],
  ['ctx', 39, 39, '  before { sale }'],
  ['ctx', 40, 40, '  describe "GET /api/unit_sales/:id" do'],
  ['ctx', 41, 41, '    let(:token) { create(:api_token, scope: "data:read") }'],
  ['del', 42, null, '    it "returns the sale" do # old name, returned every field including bonus data'],
  ['add', null, 42, '    it "omits bonus fields" do'],
  ['add', null, 43, '      # Bonus fields stay out of the read scope, so only a sales token sees them.'],
  ['add', null, 44, '      get api_unit_sale_path(sale), headers: auth(token) # raises unless the token is valid'],
  ['add', null, 45, '      expect(json.keys).not_to include("bonus_amount")'],
  ['add', null, 46, '    end'],
  ['ctx', 43, 47, '  end'],
  ['ctx', 44, 48, 'end'],
]);

const specHunk2 = hunk('@@ -61,3 +65,9 @@', [
  ['ctx', 61, 65, '  describe "sales:read token" do'],
  ['add', null, 66, '    it "still returns bonus fields" do'],
  ['add', null, 67, '      get api_unit_sale_path(sale), headers: auth(sales_token)'],
  ['add', null, 68, '      expect(json.keys).to include("bonus_amount")'],
  ['add', null, 69, '    end'],
  ['ctx', 62, 70, '  end'],
]);

const swaggerHunk = hunk('@@ -212,7 +212,11 @@ paths:', [
  ['ctx', 212, 212, '  /api/unit_sales/{id}:'],
  ['ctx', 213, 213, '    get:'],
  ['ctx', 214, 214, '      summary: Fetch a lot sale'],
  ['del', 215, null, '      description: Returns all sale fields'],
  ['add', null, 215, '      description: Returns sale fields allowed by token scope'],
  ['add', null, 216, '      x-hidden-fields:'],
  ['add', null, 217, '        data:read: bonus_amount, bonus_rate'],
  ['ctx', 216, 218, '      responses:'],
]);

const baseHunk = hunk('@@ -18,6 +18,9 @@ class BaseController < ApplicationController', [
  ['ctx', 18, 18, '  private'],
  ['ctx', 19, 19, ''],
  ['del', 20, null, '  def serializer_scope = :all'],
  ['add', null, 20, '  def serializer_scope'],
  ['add', null, 21, '    current_token.data_read? ? :data_read : :all'],
  ['add', null, 22, '  end'],
  ['ctx', 21, 23, ''],
]);

const saleHunk = hunk('@@ -52,4 +52,12 @@ class UnitSale < ApplicationRecord', [
  ['ctx', 52, 52, '  def as_json(opts = {})'],
  ['del', 53, null, '    super'],
  ['add', null, 53, '    super.except(*hidden_for(opts[:scope]))'],
  ['ctx', 54, 54, '  end'],
  ['add', null, 55, ''],
  ['add', null, 56, '  def hidden_for(scope)'],
  ['add', null, 57, '    scope == :data_read ? %w[bonus_amount bonus_rate] : []'],
  ['add', null, 58, '  end'],
]);

const specSince = hunk('@@ -41,3 +41,6 @@ RSpec.describe "data:read token" do', [
  ['ctx', 41, 41, '    let(:token) { create(:api_token, scope: "data:read") }'],
  ['add', null, 42, '    it "omits bonus fields" do'],
  ['add', null, 43, '      get api_unit_sale_path(sale), headers: auth(token)'],
  ['ctx', 42, 44, '    end'],
]);

const swaggerSince = hunk('@@ -214,3 +214,5 @@ paths:', [
  ['ctx', 214, 214, '      summary: Fetch a lot sale'],
  ['add', null, 215, '      x-hidden-fields:'],
  ['add', null, 216, '        data:read: bonus_amount, bonus_rate'],
  ['ctx', 215, 217, '      responses:'],
]);

function file(path: string, additions: number, deletions: number, hunks: Hunk[]): DiffFile {
  return { path, additions, deletions, hunks };
}

export const UNITS_API_310_ALL: DiffFile[] = [
  file('app/controllers/api/base_controller.rb', 5, 2, [baseHunk]),
  file('app/models/unit_sale.rb', 9, 1, [saleHunk]),
  file('spec/requests/api/data_read_token_spec.rb', 24, 3, [specHunk1, specHunk2]),
  file('swagger/v1/swagger.generated.yaml', 4, 2, [swaggerHunk]),
];

export const UNITS_API_310_SINCE: DiffFile[] = [
  file('spec/requests/api/data_read_token_spec.rb', 24, 3, [specSince]),
  file('swagger/v1/swagger.generated.yaml', 4, 2, [swaggerSince]),
];

/** One line over 250 characters, so the diff must scroll sideways. */
const LONG_CODE =
  '  const unitSaleSummaryForDataReadTokenWithBonusFieldsRedactedAndScopeAwareSerialization = build_summary(sale, scope: token.scope, include_derived_fields: true, include_audit_trail: false, locale: locale_for(request), currency: "USD", rounding: :half_even, precision: 2, legacy_mode: legacy?)';

/** The start of a long line whose only change is appended at its end, past the pane's right edge. */
const END_CHANGE_CODE =
  "    expect(response.body).to include(\"analytics.init('phc_fixture_key',{api_host:'https://analytics.example.test',person_profiles:'identified_only',autocapture:false";

/** Long lines and a wide hunk header, so the horizontal scroll and Wrap cases are reproducible. */
export const LONG_LINES_DIFF: DiffFile[] = [
  file('app/serializers/unit_sale_summary.rb', 3, 1, [
    hunk('@@ -1,6 +1,8 @@ class UnitSaleSummary < ApplicationSerializer with a very long header that keeps going', [
      ['ctx', 1, 1, 'class UnitSaleSummary < ApplicationSerializer'],
      ['del', 2, null, LONG_CODE.replace('build_summary', 'legacy_summary')],
      ['add', null, 2, LONG_CODE],
      ['add', null, 3, LONG_CODE.replace('unitSaleSummary', 'unitSaleTotals') + ' # trailing comment to keep the row wide'],
      ['ctx', 3, 4, 'end'],
    ]),
  ]),
  file('spec/requests/analytics_snippet_spec.rb', 1, 1, [
    hunk('@@ -45,5 +45,5 @@ RSpec.describe "analytics snippet" do', [
      ['ctx', 45, 45, '  it "renders the init call" do'],
      ['ctx', 46, 46, '    get root_path'],
      ['del', 47, null, `${END_CHANGE_CODE}})")`],
      ['add', null, 47, `${END_CHANGE_CODE},defaults:'2026-01-30',capture_exceptions:true})")`],
      ['ctx', 48, 48, '  end'],
    ]),
  ]),
];

/** A 22-file PR, so the Files tree has folders and the list scrolls. */
export function manyFilesDiff(): DiffFile[] {
  const dirs = ['app/models', 'app/controllers/api', 'spec/requests', 'lib/tasks', 'config/initializers'];
  return Array.from({ length: 22 }, (_, i) => {
    const dir = dirs[i % dirs.length];
    const path = `${dir}/generated_${String(i + 1).padStart(2, '0')}.rb`;
    return file(path, 2, 1, [
      hunk(`@@ -1,3 +1,4 @@`, [
        ['ctx', 1, 1, `# file ${i + 1}`],
        ['del', 2, null, 'OLD = 1'],
        ['add', null, 2, 'NEW = 2'],
        ['add', null, 3, 'EXTRA = 3'],
        ['ctx', 3, 4, 'end'],
      ]),
    ]);
  });
}

/** Small generic diff for every other fixture PR. */
export function genericDiff(pr: PrSummary): DiffFile[] {
  const path = `${repoName(pr.repo)}/README.md`;
  return [
    file(path, 2, 1, [
      hunk('@@ -1,3 +1,4 @@', [
        ['ctx', 1, 1, `# ${repoName(pr.repo)}`],
        ['del', 2, null, 'Old line'],
        ['add', null, 2, 'New line'],
        ['add', null, 3, 'Another new line'],
        ['ctx', 3, 4, ''],
      ]),
    ]),
  ];
}
