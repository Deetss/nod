/**
 * In-memory stand-in for `orca-ide`, used by the fixture server. It serves synthetic sessions,
 * records sends and tab switches in memory, and never spawns a process or touches a real Orca.
 *
 * A message that contains one of the `fixture-` markers below gets the matching failure, so every
 * result state can be shown without a real session. `fixture-echo` gets Orca's unsupported receipt
 * but shows in the terminal, so the server confirms it from the output.
 */

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

const wid = (w: FakeWorktree): string => `fixture-${w.repo}::/fixture/${w.name}`;
const pane = (w: FakeWorktree): string => `tab-${w.name}:leaf-${w.name}`;
const handle = (w: FakeWorktree): string => `term_fixture_${w.name}`;

export interface FakeSend {
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

  constructor(private readonly now: () => number = Date.now) {}

  run(args: string[]): string {
    const [a, b] = args;
    if (a === 'worktree' && b === 'ps') return JSON.stringify(this.ps());
    if (a === 'terminal' && b === 'list') return JSON.stringify(this.terminals());
    if (a === 'terminal' && b === 'send') return this.send(args);
    if (a === 'terminal' && b === 'read') return this.read(args);
    if ((a === 'terminal' && (b === 'switch' || b === 'focus')) || (a === 'repo' && b === 'list')) {
      if (a === 'terminal') this.switches.push(valueOf(args, '--terminal') ?? '');
      return JSON.stringify({ result: a === 'repo' ? { repos: [] } : { ok: true } });
    }
    throw new Error(`fixture Orca does not run: ${args.slice(0, 2).join(' ')}`);
  }

  private ps() {
    return {
      result: {
        totalCount: WORKTREES.length,
        truncated: false,
        worktrees: WORKTREES.map((w) => ({
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

  private terminals() {
    return {
      result: {
        totalCount: WORKTREES.length,
        truncated: false,
        terminals: WORKTREES.map((w) => ({
          handle: handle(w),
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

  private send(args: string[]): string {
    const text = valueOf(args, '--text') ?? '';
    const term = valueOf(args, '--terminal') ?? '';
    this.sends.push({ handle: term, text, args });
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
