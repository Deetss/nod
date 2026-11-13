import type { ActivityFeed } from '../shared/activity-types';
import type { ClosedIssue, ClosedPage, ClosedPr, ClosedWindow } from '../shared/closed';
import type {
  IssueAction,
  IssueActionResult,
  IssueDetail,
  IssueInboxData,
  IssueSummary,
  RepoMeta,
} from '../shared/issue-types';
import type { DevicesResponse, PairCode } from '../shared/pairing';
import type { AndroidRelease } from '../shared/android-release';
import type { PhonesUpdateResult } from '../shared/build-update';
import type { NotifyTestResult } from '../shared/notify-test';
import type { UploadResult } from '../shared/image-upload';
import type { NumberHit } from '../shared/number-query';
import { repoPath } from '../shared/repo-name';
import type { MentionablePage } from '../shared/mentions';
import type { Settings } from '../shared/settings';
import type { SettingsSaveResult, SettingsSavedState } from '../shared/settings-save';
import type { OrcaModelsResponse } from '../shared/agent-models';
import type { PushSubscriptionJson } from '../shared/push';
import type { TriggerSwitches } from '../shared/notify-rules';
import type { OrcaDispatchRequest, OrcaDispatchResult, OrcaInfo } from '../shared/orca';
import type { OrcaPrefs, PrefsPatch } from '../shared/orca-prefs';
import type { NoticeResult, OrcaSessionsResponse, SendResult } from '../shared/orca-sessions';
import type {
  ActionResult,
  DiffData,
  DiffMode,
  DiffSide,
  InboxData,
  PrDetail,
  PrSummary,
  ReviewEvent,
} from '../shared/types';

const params = new URLSearchParams(window.location.search);

/** Fixture-only state switch (`?state=empty` and friends). */
export const STATE_PARAM = params.get('state') ?? undefined;
export const THEME_PARAM = params.get('theme') ?? undefined;
/** `?view=issues` opens the Issues view first (fixture captures). */
export const VIEW_PARAM = params.get('view') ?? undefined;

let cachedToken: string | undefined;

function sessionToken(): string {
  if (cachedToken !== undefined) return cachedToken;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="nod-token"]');
  cachedToken = meta?.content ?? '';
  return cachedToken;
}

/** Re-reads the token from the served page, for a page left open across a server restart. */
async function refreshToken(): Promise<void> {
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const fresh = doc.querySelector<HTMLMetaElement>('meta[name="nod-token"]')?.content;
  if (fresh) cachedToken = fresh;
}

/** Test hook: forgets the cached token. */
export function resetTokenCache(): void {
  cachedToken = undefined;
}

async function readError(res: Response): Promise<Error> {
  let text = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) text = body.error;
  } catch {
    // keep the status text
  }
  return new Error(text);
}

/** GETs in flight by URL. A repeat while one is pending shares it (StrictMode, effect re-runs). */
const flights = new Map<string, Promise<unknown>>();

function get<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams(extra);
  if (STATE_PARAM) q.set('state', STATE_PARAM);
  const qs = q.toString();
  const url = qs ? `${path}?${qs}` : path;
  const live = flights.get(url);
  if (live) return live as Promise<T>;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw await readError(res);
    return (await res.json()) as T;
  })().finally(() => flights.delete(url));
  flights.set(url, p);
  return p;
}

/** A JSON body, or raw bytes sent with their own content type. */
type PostBody = { raw: Blob; type: string } | { json: unknown };

const sendPost = (path: string, body: PostBody, method = 'POST') =>
  fetch(path, {
    method,
    headers: {
      'content-type': 'raw' in body ? body.type : 'application/json',
      'x-nod-token': sessionToken(),
    },
    body: 'raw' in body ? body.raw : JSON.stringify(body.json),
  });

/** True for the server's stale-token rejection (the body is plain text, not JSON). */
async function isStaleToken(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    return (await res.clone().text()).trim() === 'Forbidden token';
  } catch {
    return false;
  }
}

async function post<T>(path: string, json: unknown): Promise<T> {
  return postBody<T>(path, { json });
}

async function postBody<T>(path: string, body: PostBody, method = 'POST'): Promise<T> {
  let res = await sendPost(path, body, method);
  if (await isStaleToken(res)) {
    await refreshToken();
    res = await sendPost(path, body, method);
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

/** Fixture-only: POSTs carry `?state=` too, so a fixture can fail a write on purpose. */
const withState = (path: string) =>
  STATE_PARAM ? `${path}?state=${encodeURIComponent(STATE_PARAM)}` : path;

/** Body of the two inline comment routes. A file comment sends `subjectType: 'file'` and no line fields. */
export type InlineCommentBody =
  | { body: string; path: string; subjectType: 'file' }
  | {
      body: string;
      path: string;
      subjectType: 'line';
      line: number;
      side: DiffSide;
      startLine?: number;
      startSide?: DiffSide;
    };

const closedParams = (window: ClosedWindow, after: string | undefined): Record<string, string> => ({
  window: String(window),
  ...(after ? { after } : {}),
});

const prPath = (repo: string, number: number) =>
  `/api/pr/${repoPath(repo)}/${number}`;

export const api = {
  /** The server's saved list. Costs nothing on GitHub. */
  inbox: () => get<InboxData>('/api/inbox'),
  /** Asks the server to sweep GitHub now. */
  refresh: () => post<{ ok: boolean }>('/api/refresh', {}),
  /** Asks for a delta poll now. The server ignores it when one ran in the last 10 s. */
  nudgeSync: () => post<{ polled: boolean }>('/api/sync/nudge', {}),
  detail: (repo: string, number: number) => get<PrDetail>(prPath(repo, number)),
  diff: (repo: string, number: number, mode: DiffMode) =>
    get<DiffData>(`${prPath(repo, number)}/diff`, { mode }),
  setViewed: (prId: string, path: string, viewed: boolean) =>
    post<ActionResult>('/api/viewed', { prId, path, viewed }),
  review: (repo: string, number: number, event: ReviewEvent, body: string) =>
    post<ActionResult>(withState('/api/review'), { repo, number, event, body }),
  /** GitHub's sanitised HTML preview of a comment body. Sanitise before insertion. */
  renderMarkdown: (repo: string, text: string) => post<{ html: string }>('/api/markdown', { repo, text }),
  /** Posts one line or file comment now. `line` and `side` are omitted for a file comment. */
  addInlineComment: (repo: string, number: number, body: InlineCommentBody) =>
    post<ActionResult>(`${prPath(repo, number)}/comments/inline`, body),
  /** Adds one line or file comment to the viewer's pending review. */
  addDraftComment: (repo: string, number: number, body: InlineCommentBody) =>
    post<ActionResult>(`${prPath(repo, number)}/comments/draft`, body),
  replyToThread: (repo: string, number: number, threadId: string, body: string) =>
    post<ActionResult>(`${prPath(repo, number)}/threads/reply`, { threadId, body }),
  resolveThread: (repo: string, number: number, threadId: string) =>
    post<ActionResult>(`${prPath(repo, number)}/threads/resolve`, { threadId }),
  unresolveThread: (repo: string, number: number, threadId: string) =>
    post<ActionResult>(`${prPath(repo, number)}/threads/unresolve`, { threadId }),
  /** Changes the body of one of the viewer's drafts. `commentId` is the draft comment's GraphQL id. */
  editDraft: (repo: string, number: number, commentId: string, body: string) =>
    post<ActionResult>(`${prPath(repo, number)}/drafts/edit`, { commentId, body }),
  deleteDraft: (repo: string, number: number, commentId: string) =>
    post<ActionResult>(`${prPath(repo, number)}/drafts/delete`, { commentId }),
  /** Deletes the viewer's whole pending review and all its drafts. */
  discardReview: (repo: string, number: number) => post<ActionResult>(`${prPath(repo, number)}/review/discard`, {}),
  merge: (repo: string, number: number) => post<ActionResult>('/api/merge', { repo, number }),
  adminMerge: (repo: string, number: number, confirm: number) =>
    post<ActionResult>('/api/admin-merge', { repo, number, confirm }),
  prComment: (repo: string, number: number, body: string) =>
    post<ActionResult>('/api/pr-comment', { repo, number, body }),
  /** Uploads a comment image through the server, which holds the GitHub token. */
  uploadImage: (repo: string, file: File) =>
    postBody<UploadResult>(
      `/api/upload-image?${new URLSearchParams({ repo, name: file.name })}`,
      { raw: file, type: file.type },
    ),
  markReady: (repo: string, number: number) => post<ActionResult>('/api/ready', { repo, number }),
  issues: () => get<IssueInboxData>('/api/issues'),
  /** One page of closed PRs or issues. A separate search, run on demand only. */
  closedPrs: (window: ClosedWindow, after?: string) =>
    get<ClosedPage<ClosedPr>>('/api/closed/prs', closedParams(window, after)),
  closedIssues: (window: ClosedWindow, after?: string) =>
    get<ClosedPage<ClosedIssue>>('/api/closed/issues', closedParams(window, after)),
  /** Events grouped per item over the last `days` days. */
  activity: (days: number) => get<ActivityFeed>('/api/activity', { days: String(days) }),
  activityVisit: () => post<{ lastVisit: number }>('/api/activity/visit', {}),
  issueDetail: (repo: string, number: number) =>
    get<IssueDetail>(`/api/issue/${repoPath(repo)}/${number}`),
  repoMeta: (repo: string) => get<RepoMeta>(`/api/repo-meta/${repoPath(repo)}`),
  /** One page of users who can be mentioned in `repo`. Pass the last page's cursor for the next. */
  mentionable: (repo: string, cursor?: string) =>
    get<MentionablePage>(`/api/mentionable/${repoPath(repo)}`, cursor ? { cursor } : {}),
  /** Issue or PR `number` in each repo, fetched from GitHub. One call per repo. */
  lookup: (number: number, repos: readonly string[]) =>
    get<{ hits: NumberHit[] }>(`/api/lookup/${number}`, { repos: repos.join(',') }),
  issueAction: (action: IssueAction) => post<IssueActionResult>('/api/issue-action', action),
  devices: () => get<DevicesResponse>('/api/devices'),
  pairCode: () => post<PairCode>('/api/pair/code', {}),
  renameDevice: (id: string, name: string) => post<{ ok: boolean }>('/api/devices/rename', { id, name }),
  revokeDevice: (id: string) => post<{ ok: boolean }>('/api/devices/revoke', { id }),
  /** Reloads connected phones and pushes to the rest. Loopback only. */
  updatePhones: () => post<PhonesUpdateResult>('/api/phones/update', {}),
  testNotifications: () => post<NotifyTestResult>('/api/notifications/test', {}),
  /** The published APK's metadata. Rejects with "No Android build published" before the first build. */
  androidLatest: () => get<AndroidRelease>('/api/android/latest'),
  pushKey: () => get<{ publicKey: string }>('/api/push/key'),
  pushSubscribe: (sub: PushSubscriptionJson) => post<{ ok: boolean }>('/api/push/subscribe', sub),
  pushUnsubscribe: () => post<{ ok: boolean }>('/api/push/unsubscribe', {}),
  /** This phone's notification switches. */
  pushPrefs: () => get<TriggerSwitches>('/api/push/prefs'),
  setPushPrefs: (patch: Partial<TriggerSwitches>) => post<TriggerSwitches>('/api/push/prefs', patch),
  settings: () => get<Settings>('/api/settings'),
  /** Whether `app-settings.json` exists yet. False means first run. */
  settingsSaved: () => get<SettingsSavedState>('/api/settings/saved'),
  /** Validates and writes the settings file, then the service restarts. Loopback only. */
  saveSettings: (body: unknown) => postBody<SettingsSaveResult>('/api/settings', { json: body }, 'PUT'),
  /** The server's id, or a rejection while it is down. Never cached. */
  health: async () => {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error('Not up');
    return (await res.json()) as { app: string; build: string };
  },
  orca: () => get<OrcaInfo>('/api/orca'),
  orcaDispatch: (req: OrcaDispatchRequest) => post<OrcaDispatchResult>('/api/orca/dispatch', req),
  /** The models each agent offers and the choices remembered per agent. */
  orcaModels: () => get<OrcaModelsResponse>('/api/orca/models'),
  orcaSessions: () => get<OrcaSessionsResponse>('/api/orca/sessions'),
  orcaSend: (sessionId: string, text: string, requestId?: string) =>
    post<SendResult>('/api/orca/send', { sessionId, text, ...(requestId ? { requestId } : {}) }),
  /** Looks again for an unconfirmed send in the session's terminal. Never resends. */
  orcaConfirm: (sessionId: string, requestId: string) => post<SendResult>('/api/orca/confirm', { sessionId, requestId }),
  orcaChoose: (prId: string, sessionId: string | null) =>
    post<{ ok: boolean }>('/api/orca/choose', { prId, sessionId }),
  orcaPrefs: (patch: PrefsPatch) => post<Pick<OrcaPrefs, 'enabled' | 'repos'>>('/api/orca/prefs', patch),
  orcaOpen: (sessionId: string) => post<{ ok: boolean }>('/api/orca/open', { sessionId }),
  /** Waits up to 6 s for an automatic notification to finish. */
  orcaNotice: (id: string) => get<NoticeResult>(`/api/orca/notice/${encodeURIComponent(id)}`),
  issueSeen: (issue: Pick<IssueSummary, 'id' | 'updatedAt' | 'commentCount'>) =>
    post<{ ok: boolean }>('/api/issue-seen', {
      id: issue.id,
      updatedAt: issue.updatedAt,
      commentCount: issue.commentCount,
    }),
  seen: (pr: PrSummary) =>
    post<{ ok: boolean }>('/api/seen', {
      id: pr.id,
      updatedAt: pr.updatedAt,
      headSha: pr.headSha,
      commitCount: pr.commitCount,
    }),
};
