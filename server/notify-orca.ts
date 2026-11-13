import { randomUUID } from 'node:crypto';
import type { ActivityItemRef } from '../shared/activity-types';
import { matchSessions, relatedToIssue, type Matched } from '../shared/orca-match';
import {
  buildEventMessage,
  EVENT_WORD,
  isIssueEvent,
  prepareAuto,
  type OrcaEventKind,
} from '../shared/orca-message';
import { autoMessagesOn, stateReceives } from '../shared/orca-policy';
import type { NoticeResult } from '../shared/orca-sessions';
import type { ActivityStore } from './activity-store';
import type { Orca } from './orca';
import type { OrcaPrefsStore } from './orca-prefs';
import { orcaCode, sendToSession } from './orca-send';
import type { OrcaSessions } from './orca-sessions';
import type { Provider, StateQuery } from './provider';

/** The notification is best effort and never outlives this. */
export const NOTIFY_TIMEOUT_MS = 5_000;
/** Part of that budget spent looking for an unconfirmed message in the terminal. */
const NOTIFY_CONFIRM_MS = 2_000;
const KEEP_MS = 2 * 60_000;

export interface NotifyDeps {
  orca: Orca;
  sessions: OrcaSessions;
  prefs: OrcaPrefsStore;
  activity: ActivityStore;
  provider: Provider;
  timeoutMs?: number;
  confirmMs?: number;
  now?: () => number;
}

export interface NotifyRequest {
  kind: OrcaEventKind;
  repo: string;
  number: number;
  method?: 'squash' | 'merge';
  reason?: 'completed' | 'not-planned';
  /** Fixture-only `?state=` value, passed to the provider lookups. */
  state?: StateQuery;
}

interface Entry {
  result: NoticeResult;
  done: Promise<void>;
}

const NONE: NoticeResult = { status: 'none' };

/**
 * Tells a related Orca session what the user just did on GitHub. The GitHub action has already
 * finished and answered by the time this runs, and nothing here throws into the route: `start`
 * returns at once, the work runs in the background under a hard timeout, and any failure becomes a
 * result the client can show.
 */
export class OrcaNotifier {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly deps: NotifyDeps) {}

  /** Starts one notification and returns its id, or undefined when the switch is off for the repo. */
  start(req: NotifyRequest): string | undefined {
    try {
      if (!autoMessagesOn(this.deps.prefs.get(), req.repo)) return undefined;
      const id = randomUUID();
      const entry: Entry = { result: { status: 'pending' }, done: Promise.resolve() };
      entry.done = this.guarded(req).then((r) => {
        entry.result = r;
      });
      this.entries.set(id, entry);
      setTimeout(() => this.entries.delete(id), KEEP_MS).unref();
      return id;
    } catch {
      return undefined;
    }
  }

  /** The result of a notification, waiting up to `ms` for it. Undefined for an unknown id. */
  async result(id: string, ms: number): Promise<NoticeResult | undefined> {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.result.status === 'pending') {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        entry.done,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ms);
        }),
      ]);
      clearTimeout(timer);
    }
    return entry.result;
  }

  /** Resolves when every started notification has settled. For tests. */
  async settled(): Promise<void> {
    await Promise.all([...this.entries.values()].map((e) => e.done));
  }

  private async guarded(req: NotifyRequest): Promise<NoticeResult> {
    const word = EVENT_WORD[req.kind];
    const progress = { name: '' };
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<NoticeResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: 'failed', name: progress.name, word, code: 'timeout' }),
        this.deps.timeoutMs ?? NOTIFY_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([this.run(req, progress), timeout]);
    } catch (e) {
      return { status: 'failed', name: progress.name, word, code: orcaCode(e) };
    } finally {
      clearTimeout(timer);
    }
  }

  private note(item: ActivityItemRef | undefined, text: string, icon: 'bubble' | 'info' | 'alert'): void {
    if (!item) return;
    try {
      this.deps.activity.addNotice(item, text, icon, this.deps.now?.());
    } catch {
      // A notice that cannot be written is not worth a failure.
    }
  }

  private async run(req: NotifyRequest, progress: { name: string }): Promise<NoticeResult> {
    const { provider, sessions, prefs } = this.deps;
    const word = EVENT_WORD[req.kind];
    const snap = await sessions.snapshot();
    if (!snap.available) return NONE;

    const viewer = (await provider.inbox(req.state, 'none')).viewer;
    let item: ActivityItemRef | undefined;
    let related: Matched[];
    if (isIssueEvent(req.kind)) {
      const issue = (await provider.issues(req.state)).issues.find((i) => i.repo === req.repo && i.number === req.number);
      item = issue && { kind: 'issue', id: issue.id, repo: issue.repo, number: issue.number, title: issue.title, url: issue.url };
      related = relatedToIssue(req.repo, req.number, snap.sessions);
    } else {
      const detail = await provider.detail({ repo: req.repo, number: req.number }, req.state).catch(() => undefined);
      const s = detail?.summary;
      item = s && { kind: 'pr', id: s.id, repo: s.repo, number: s.number, title: s.title, url: s.url };
      const chosen = s ? prefs.get().chosen[s.id] : undefined;
      related = matchSessions(
        { repo: req.repo, number: req.number, headRef: detail?.headRef ?? s?.headRef, closes: s?.closes },
        snap.sessions,
        chosen,
      ).related;
    }

    if (related.length === 0) {
      this.note(item, `Nod: no Orca session related, nobody notified (${word})`, 'info');
      return NONE;
    }
    if (related.length > 1) {
      this.note(item, `Nod: ${related.length} sessions match, nobody notified (${word})`, 'info');
      return { status: 'several', count: related.length, word };
    }

    const session = related[0]!.session;
    progress.name = session.name;
    if (!stateReceives(req.kind, session.state)) return NONE;

    const text = prepareAuto(
      buildEventMessage(req.kind, {
        repo: req.repo,
        number: req.number,
        actor: viewer,
        ...(req.method ? { method: req.method } : {}),
        ...(req.reason ? { reason: req.reason } : {}),
      }),
    );
    const sent = await sendToSession(this.deps.orca, sessions, session.id, text, {
      timeoutMs: this.deps.timeoutMs ?? NOTIFY_TIMEOUT_MS,
      confirmMs: this.deps.confirmMs ?? NOTIFY_CONFIRM_MS,
    });
    const name = session.name;
    switch (sent.status) {
      case 'sent':
        this.note(item, `Nod notified ${name} (${word})`, 'bubble');
        return { status: 'notified', name, word, confirmed: true };
      case 'unconfirmed':
        this.note(item, `Nod notified ${name} (${word}, not confirmed)`, 'bubble');
        return { status: 'notified', name, word, confirmed: false };
      case 'not-writable':
        this.note(item, `Nod could not notify ${name}: terminal not writable`, 'alert');
        return { status: 'exited', name, word };
      case 'blocked':
        this.note(item, `Nod could not notify ${name}: agent prompt blocked`, 'alert');
        return { status: 'failed', name, word, code: 'agent_prompt_blocked' };
      case 'unreachable':
        this.note(item, `Nod could not notify ${name}: Orca not reachable`, 'alert');
        return { status: 'failed', name, word, code: 'unreachable' };
    }
  }
}
