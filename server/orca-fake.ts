/**
 * In-memory stand-in for `orca-ide`, used by the fixture server. It serves synthetic sessions,
 * records sends and tab switches in memory, and never spawns a process or touches a real Orca.
 *
 * It answers for three Orca hosts: `local`, `laptop` with sessions of its own, and `desktop`, which
 * is paired but offline. A call picks its host with `--environment`, as the real CLI does.
 *
 * A message that contains one of the `fixture-` markers below gets the matching failure, so every
 * result state can be shown without a real session. `fixture-echo` gets Orca's unsupported receipt
 * but shows in the terminal, so the server confirms it from the output.
 */

import { LOCAL_HOST } from '../shared/orca-hosts';
import { appEnv } from './env';

interface FakeAgent {
  state: string;
  conversationName: string;
  paneKey: string;
  hasLivePty: boolean;
}

interface FakeWorktree {
  repo: string;
  name: string;
  branch: string;
  linkedPr?: number;
  linkedIssue?: number;
  state: string;
  writable?: boolean;
  outputAgoS: number;
}

/** Synthetic sessions. Names, repos, numbers and times are invented. */
const WORKTREES: FakeWorktree[] = [
  { repo: 'orders-api', name: 'fix-migration-365', branch: 'sam-lee/fix-migration-365', linkedPr: 365, state: 'working', outputAgoS: 30 },
  { repo: 'acme-api', name: 'crew-310', branch: 'crew/acmeapi-data-read-bonus', state: 'working', outputAgoS: 12 },
  { repo: 'acme-api', name: 'crew-307', branch: 'feature/307-release', linkedPr: 307, state: 'waiting', outputAgoS: 180 },
  { repo: 'acme-web', name: 'helper-1343', branch: 'helper/release-1343', linkedPr: 1343, state: 'done', outputAgoS: 2460 },
  { repo: 'acme-api', name: 'crew-305-a', branch: 'feature/305', state: 'working', outputAgoS: 40 },
  { repo: 'acme-api', name: 'helper-305', branch: 'helper/idx-305', linkedPr: 305, state: 'done', outputAgoS: 600 },
  { repo: 'acme-api', name: 'crew-issue-305', branch: 'issue-305-index', state: 'working', outputAgoS: 90 },
  { repo: 'acme-web', name: 'crew-1340', branch: 'feature/1340', state: 'blocked', outputAgoS: 360 },
  { repo: 'acme-web', name: 'crew-1352', branch: 'feature/1352', state: 'working', writable: false, outputAgoS: 900 },
  { repo: 'acme-api', name: 'crew-issue-412', branch: 'crew/issue-412', linkedIssue: 412, state: 'working', outputAgoS: 25 },
  { repo: 'notes', name: 'crew-aof-41', branch: 'feature/41', state: 'working', outputAgoS: 70 },
];

/** Sessions on the paired `laptop` host. */
const LAPTOP_WORKTREES: FakeWorktree[] = [
  { repo: 'orders-api', name: 'refund-372', branch: 'feature/refund-372', linkedPr: 372, state: 'working', outputAgoS: 45 },
  { repo: 'acme-api', name: 'swagger-309', branch: 'chore/swagger-309', linkedPr: 309, state: 'waiting', outputAgoS: 240 },
];

/** `NOD_FIXTURE_SESSIONS=hosts` adds these on `laptop`, so #365 lists sessions on two hosts. */
const LAPTOP_365: FakeWorktree[] = [
  { repo: 'orders-api', name: 'review-365', branch: 'sam-lee/review-365', linkedPr: 365, state: 'done', outputAgoS: 300 },
  { repo: 'orders-api', name: 'crew-310', branch: 'crew/orders-365-read-bonus', state: 'working', outputAgoS: 20 },
];

/** Sessions `desktop` reports while `NOD_FIXTURE_DESKTOP_UP_S` lasts, so its chip can be seen going offline. */
const DESKTOP_WORKTREES: FakeWorktree[] = [
  { repo: 'orders-api', name: 'webhooks-373', branch: 'feature/webhooks-373', linkedPr: 373, state: 'working', outputAgoS: 60 },
];

export const FIXTURE_ONLINE_HOST = 'laptop';
export const FIXTURE_OFFLINE_HOST = 'desktop';

/**
 * `NOD_FIXTURE_SESSIONS` reshapes the sessions for PR #365, so every Dispatch target shows:
 * `several` adds a second linked session (the picker), `none` unlinks it (a new worktree).
 */
function fixtureWorktrees(mode = appEnv('FIXTURE_SESSIONS')): FakeWorktree[] {
  if (mode === 'none') return WORKTREES.filter((w) => w.linkedPr !== 365);
  if (mode === 'several') {
    return [...WORKTREES, { repo: 'orders-api', name: 'review-365', branch: 'sam-lee/review-365', linkedPr: 365, state: 'done', outputAgoS: 300 }];
  }
  return WORKTREES;
}

const wid = (w: FakeWorktree): string => `fixture-${w.repo}::/fixture/${w.name}`;
const pane = (w: FakeWorktree): string => `tab-${w.name}:leaf-${w.name}`;
const handle = (host: string, w: FakeWorktree): string =>
  host === LOCAL_HOST ? `term_fixture_${w.name}` : `term_fixture_${host}_${w.name}`;

export interface FakeSend {
  host: string;
  handle: string;
  text: string;
  args: string[];
}

export class OrcaFake {
  /** Every `terminal send` the fake received. Memory only. */
  readonly sends: FakeSend[] = [];
  /** Handles passed to `terminal switch`. */
  readonly switches: string[] = [];
  /** Output lines per handle, so `terminal read --cursor` can show what arrived. */
  private readonly output = new Map<string, string[]>();
  private n = 0;
  private readonly byHost = new Map<string, FakeWorktree[]>([
    [LOCAL_HOST, fixtureWorktrees()],
    [FIXTURE_ONLINE_HOST, appEnv('FIXTURE_SESSIONS') === 'hosts' ? [...LAPTOP_WORKTREES, ...LAPTOP_365] : LAPTOP_WORKTREES],
  ]);
  private readonly desktopUntil: number;

  constructor(private readonly now: () => number = Date.now) {
    this.desktopUntil = now() + Number(appEnv('FIXTURE_DESKTOP_UP_S') ?? 0) * 1000;
  }

  run(argv: string[]): string {
    const host = valueOf(argv, '--environment') ?? LOCAL_HOST;
    const args = host === LOCAL_HOST ? argv : argv.slice(0, argv.indexOf('--environment'));
    const [a, b] = args;
    if (this.now() < this.desktopUntil) this.byHost.set(FIXTURE_OFFLINE_HOST, DESKTOP_WORKTREES);
    else this.byHost.delete(FIXTURE_OFFLINE_HOST);
    if (a === 'environment' && b === 'list') {
      return JSON.stringify({
        result: {
          environments: [
            { id: 'env-fixture-1', name: FIXTURE_ONLINE_HOST },
            { id: 'env-fixture-2', name: FIXTURE_OFFLINE_HOST },
          ],
        },
      });
    }
    const worktrees = this.byHost.get(host);
    if (!worktrees) throw new Error(`Orca environment ${host} is not reachable`);
    if (a === 'worktree' && b === 'ps') return JSON.stringify(this.ps(worktrees));
    if (a === 'terminal' && b === 'list') return JSON.stringify(this.terminals(host, worktrees));
    if (a === 'terminal' && b === 'send') return this.send(host, args);
    if (a === 'terminal' && b === 'read') return this.read(args);
    if ((a === 'terminal' && (b === 'switch' || b === 'focus')) || (a === 'repo' && b === 'list')) {
      if (a === 'terminal') this.switches.push(valueOf(args, '--terminal') ?? '');
      return JSON.stringify({ result: a === 'repo' ? { repos: [] } : { ok: true } });
    }
    throw new Error(`fixture Orca does not run: ${args.slice(0, 2).join(' ')}`);
  }

  private ps(worktrees: FakeWorktree[]) {
    return {
      result: {
        totalCount: worktrees.length,
        truncated: false,
        worktrees: worktrees.map((w) => ({
          worktreeId: wid(w),
          repoId: `fixture-${w.repo}`,
          path: `/fixture/${w.name}`,
          displayName: w.name,
          branch: `refs/heads/${w.branch}`,
          linkedPR: w.linkedPr ? { number: w.linkedPr } : null,
          linkedIssue: w.linkedIssue ? { number: w.linkedIssue } : null,
          linkedItems: [],
          agents: [
            {
              state: w.state,
              agentType: 'claude',
              conversationName: w.name,
              paneKey: pane(w),
              hasLivePty: true,
            } satisfies FakeAgent & { agentType: string },
          ],
        })),
      },
    };
  }

  private terminals(host: string, worktrees: FakeWorktree[]) {
    return {
      result: {
        totalCount: worktrees.length,
        truncated: false,
        terminals: worktrees.map((w) => ({
          handle: handle(host, w),
          worktreeId: wid(w),
          tabId: `tab-${w.name}`,
          leafId: `leaf-${w.name}`,
          connected: true,
          writable: w.writable ?? true,
          lastOutputAt: this.now() - w.outputAgoS * 1000,
          agentIdentity: 'claude',
        })),
      },
    };
  }

  private send(host: string, args: string[]): string {
    const text = valueOf(args, '--text') ?? '';
    const term = valueOf(args, '--terminal') ?? '';
    this.sends.push({ host, handle: term, text, args });
    this.n += 1;
    const requestId = `fixture-req-${this.n}`;
    if (text.includes('fixture-down')) throw new Error('Orca is not running');
    if (text.includes('fixture-exited')) throw new Error(JSON.stringify({ error: { code: 'terminal_not_writable', message: 'Terminal is not writable' } }));
    if (text.includes('fixture-blocked')) throw new Error(JSON.stringify({ error: { code: 'agent_prompt_blocked', message: 'A prompt is open' } }));
    const unsupported = { requestId, stages: ['input_accepted'], provider: 'unsupported', observation: 'unsupported' };
    if (text.includes('fixture-unconfirmed')) return JSON.stringify({ result: { send: { accepted: true, prompt: unsupported } } });
    this.output.set(term, [...(this.output.get(term) ?? []), `❯ ${text}`, '']);
    if (text.includes('fixture-echo')) return JSON.stringify({ result: { send: { accepted: true, prompt: unsupported } } });
    return JSON.stringify({ result: { send: { accepted: true, prompt: { requestId, stages: ['input_accepted', 'turn_started'] } } } });
  }

  private read(args: string[]): string {
    const lines = this.output.get(valueOf(args, '--terminal') ?? '') ?? [];
    const from = Number(valueOf(args, '--cursor') ?? lines.length);
    return JSON.stringify({ result: { terminal: { tail: lines.slice(from), nextCursor: String(lines.length) } } });
  }
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
