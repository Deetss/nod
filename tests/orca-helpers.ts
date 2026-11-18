import { Orca, type OrcaExec } from '../server/orca';

/** A synthetic Orca session for tests. Nothing here reaches a real Orca. */
export interface FakeSession {
  name: string;
  /** Lower-case GitHub repo name. */
  repo: string;
  branch?: string;
  linkedPr?: number;
  linkedIssue?: number;
  state?: string;
  hasLivePty?: boolean;
  writable?: boolean;
  /** Leave the session out of `terminal list`. */
  noTerminal?: boolean;
  handle?: string;
}

export const PROMPT_SECRET = 'SECRET-PROMPT-TEXT';

const wid = (s: FakeSession) => `r-${s.repo}::/w/${s.name}`;

export function psJson(sessions: FakeSession[]): string {
  return JSON.stringify({
    result: {
      totalCount: sessions.length,
      truncated: false,
      worktrees: sessions.map((s) => ({
        worktreeId: wid(s),
        repoId: `r-${s.repo}`,
        path: `/w/${s.name}`,
        displayName: s.name,
        branch: s.branch ? `refs/heads/${s.branch}` : '',
        linkedPR: s.linkedPr ? { number: s.linkedPr, title: PROMPT_SECRET } : null,
        linkedIssue: s.linkedIssue ?? null,
        linkedItems: [],
        agents: [
          {
            state: s.state ?? 'working',
            agentType: 'claude',
            conversationName: s.name,
            paneKey: `tab-${s.name}:leaf-${s.name}`,
            hasLivePty: s.hasLivePty ?? true,
            prompt: PROMPT_SECRET,
            lastAssistantMessage: PROMPT_SECRET,
            toolInput: PROMPT_SECRET,
          },
        ],
      })),
    },
  });
}

export function listJson(sessions: FakeSession[]): string {
  return JSON.stringify({
    result: {
      terminals: sessions
        .filter((s) => !s.noTerminal)
        .map((s) => ({
          handle: s.handle ?? `term_${s.name}`,
          worktreeId: wid(s),
          tabId: `tab-${s.name}`,
          leafId: `leaf-${s.name}`,
          connected: true,
          writable: s.writable ?? true,
          lastOutputAt: 1_000,
          preview: PROMPT_SECRET,
        })),
    },
  });
}

export interface Harness {
  orca: Orca;
  /** Every CLI call: the binary and its arguments. */
  calls: string[][];
  /** Calls to `terminal send`. */
  sends: () => string[][];
  setSessions: (s: FakeSession[]) => void;
  /** Returns the stdout of a send, or throws. */
  onSend: { fn: (args: string[]) => string | Promise<string> };
  /** Returns the stdout of a `terminal read`, or throws. */
  onRead: { fn: (args: string[]) => string };
  /** Makes `worktree ps` fail, as when Orca is closed. */
  down: { value: boolean };
  /** Milliseconds each `worktree ps` takes. */
  delay: { ms: number };
  clock: { now: number };
  /** Paired Orca hosts by name, as `environment list` reports them. A host that is down never answers. */
  remotes: Record<string, { sessions: FakeSession[]; down?: boolean }>;
}

const OK_SEND = JSON.stringify({ result: { requestId: 'req-1', stages: ['input_accepted', 'turn_started'] } });

/** An `Orca` over a fake exec. Every command is recorded; nothing is spawned. */
export function harness(initial: FakeSession[] = []): Harness {
  let sessions = initial;
  const calls: string[][] = [];
  const onSend: Harness['onSend'] = { fn: () => OK_SEND };
  const onRead: Harness['onRead'] = { fn: () => readJson([], '0') };
  const down = { value: false };
  const delay = { ms: 0 };
  const clock = { now: 1_000_000 };
  const remotes: Harness['remotes'] = {};
  const repos = ['acme-web', 'acme-api', 'notes'];
  const exec: OrcaExec = async (bin, argv) => {
    calls.push([bin, ...argv]);
    const env = argv.indexOf('--environment');
    const args = env >= 0 ? argv.slice(0, env) : argv;
    if (args[0] === 'environment' && args[1] === 'list') {
      return JSON.stringify({ result: { environments: Object.keys(remotes).map((name, i) => ({ id: `env-${i}`, name })) } });
    }
    if (env >= 0) return remote(remotes[argv[env + 1] ?? ''], args);
    if (bin === 'git') return `git@github.com:acme-co/${args[1]?.split('/').pop() ?? ''}.git\n`;
    const [a, b] = args;
    if (a === '--help') return 'ok';
    if (a === 'repo' && b === 'list') {
      return JSON.stringify({ result: { repos: repos.map((r) => ({ id: `r-${r}`, path: `/repos/${r}` })) } });
    }
    if (a === 'worktree' && b === 'ps') {
      if (down.value) throw new Error('Orca is not running');
      if (delay.ms > 0) await new Promise((r) => setTimeout(r, delay.ms));
      return psJson(sessions);
    }
    if (a === 'terminal' && b === 'list') {
      if (down.value) throw new Error('Orca is not running');
      return listJson(sessions);
    }
    if (a === 'terminal' && b === 'send') return onSend.fn(args);
    if (a === 'terminal' && b === 'read') return onRead.fn(args);
    if (a === 'terminal' && b === 'switch') return JSON.stringify({ result: { ok: true } });
    throw new Error(`unexpected command ${args.join(' ')}`);
  };
  /** A paired host reports each repo's remote itself, since its paths are not on this disk. */
  const remote = async (host: Harness['remotes'][string] | undefined, args: string[]): Promise<string> => {
    if (!host || host.down) throw new Error('environment not reachable');
    const [a, b] = args;
    if (a === 'repo' && b === 'list') {
      const list = repos.map((r) => ({ id: `r-${r}`, gitRemoteIdentity: { remoteUrl: `git@github.com:acme-co/${r}.git` } }));
      return JSON.stringify({ result: { repos: list } });
    }
    if (a === 'worktree' && b === 'ps') return psJson(host.sessions);
    if (a === 'worktree' && b === 'create') return JSON.stringify({ result: { worktree: { name: 'made-remote' } } });
    if (a === 'terminal' && b === 'list') return listJson(host.sessions);
    if (a === 'terminal' && b === 'send') return onSend.fn(args);
    if (a === 'terminal' && b === 'switch') return JSON.stringify({ result: { ok: true } });
    throw new Error(`unexpected remote command ${args.join(' ')}`);
  };
  const orca = new Orca({ exec, candidates: ['orca-ide'], now: () => clock.now });
  return {
    orca,
    calls,
    sends: () => calls.filter((c) => c[1] === 'terminal' && c[2] === 'send'),
    setSessions: (s) => {
      sessions = s;
    },
    onSend,
    onRead,
    down,
    delay,
    clock,
    remotes,
  };
}

/** A `terminal read --json` answer. */
export const readJson = (tail: string[], nextCursor: string): string =>
  JSON.stringify({ result: { terminal: { tail, nextCursor, source: 'stream' } } });

export const failure = (code: string): Error =>
  new Error(JSON.stringify({ error: { code, message: code } }));
