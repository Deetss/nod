import type { OrcaPrefs } from './orca-prefs';

/** What Nod shows for an Orca agent session. `unknown` covers any value it does not recognise. */
export type SessionState = 'working' | 'waiting' | 'done' | 'unknown';

/** `working`, `waiting` and `done` are the values Orca reports today; anything else reads as unknown. */
export function mapSessionState(raw: unknown): SessionState {
  return raw === 'working' || raw === 'waiting' || raw === 'done' ? raw : 'unknown';
}

export const STATE_WORD: Record<SessionState, string> = {
  working: 'working',
  waiting: 'waiting',
  done: 'done',
  unknown: 'unknown',
};

/** A PR or issue link on a worktree. `repo` is a lower-case GitHub repo name when the link says which. */
export interface LinkedItem {
  number: number;
  repo?: string;
}

/**
 * One live agent session, reduced to the fields matching needs. The server builds it from
 * `worktree ps` and never copies prompts or assistant text.
 */
export interface SessionCandidate {
  /** `<worktreeId>|<paneKey>`. Stable while the agent pane lives. */
  id: string;
  worktreeId: string;
  name: string;
  state: SessionState;
  /** Lower-case GitHub repo name of the worktree's Orca repo, when Orca maps it. */
  repo?: string;
  /** Branch with `refs/heads/` stripped. Empty for a detached head. */
  branch: string;
  linkedPrs: LinkedItem[];
  linkedIssues: LinkedItem[];
  /** The agent row has a live pty. A session without one is never offered. */
  live: boolean;
  /** Last terminal output, ms. */
  lastOutputAt?: number;
}

export type MatchVia = 'pr' | 'branch' | 'issue' | 'number' | 'chosen';

/** A candidate as the client sees it. */
export interface SessionView {
  id: string;
  name: string;
  state: SessionState;
  branch: string;
  via: MatchVia;
  /** Short reason for the picker, e.g. `linked PR #1355`. */
  reason: string;
  lastOutputAt?: number;
}

export interface PrSessions {
  related: SessionView[];
  possible: SessionView[];
  /** The remembered session id for this PR, when it is still live. */
  chosen?: string;
}

/** `GET /api/orca/sessions`. `available` is false when Orca or its CLI is missing or unreachable. */
export interface OrcaSessionsResponse {
  available: boolean;
  at: number;
  prefs: Pick<OrcaPrefs, 'enabled' | 'repos'>;
  byPr: Record<string, PrSessions>;
  /** Live sessions whose worktree Orca links to the issue, by issue id. */
  byIssue: Record<string, SessionView[]>;
}

export type SendStatus = 'sent' | 'unconfirmed' | 'not-writable' | 'blocked' | 'unreachable';

/** What proved a send: Orca's own turn start, the message in the terminal's output, or an idle agent starting work. */
export type ConfirmedBy = 'orca' | 'echo' | 'state';

/** The delivery fields of Orca's send receipt. Never includes the message or terminal output. */
export interface Receipt {
  provider?: string;
  stages?: string[];
  observation?: string;
}

export interface SendResult {
  status: SendStatus;
  /** Set when Orca offered an id for one retry of an ambiguous send, and for Check again. */
  requestId?: string;
  confirmedBy?: ConfirmedBy;
  receipt?: Receipt;
}

/** Result of an automatic notification, read from `GET /api/orca/notice/:id`. */
export type NoticeResult =
  | { status: 'pending' }
  | { status: 'none' }
  | { status: 'notified'; name: string; word: string; confirmed: boolean }
  | { status: 'several'; count: number; word: string }
  | { status: 'exited'; name: string; word: string }
  | { status: 'failed'; name: string; word: string; code: string };

/** Longest message the dialog and the send route accept. */
export const SEND_MAX = 600;
