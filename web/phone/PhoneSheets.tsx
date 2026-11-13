import { useCallback, useEffect, useRef, useState } from 'react';
import { issueRepos } from '../issues/issue-filter';
import { createAction, descriptionDraftKey, emptyForm, type NewIssueForm } from './new-issue';
import { PhoneNewIssue } from './PhoneNewIssue';
import type { IssueAction, IssueSummary } from '../../shared/issue-types';
import { useBotRetry } from '../issues/useBotRetry';
import { useBotSplit } from '../issues/useBotSplit';
import { useBotCheck, useBotTrim } from '../issues/useBotCheck';
import { phoneBotState } from './bot-check-phone';
import { PhoneBotSplit } from './PhoneBotSplit';
import type { PrSummary } from '../../shared/types';
import { NO_ACCESS, reviewAccess } from '../../shared/pr-actions';
import { DEFAULT_AGENT, dispatchPrompt, repoInOrca, worktreeName } from '../../shared/orca';
import { hasBotLabel } from '../../shared/bot';
import { canFix, checksDispatch, failingChecks, botComment } from '../../shared/fix-checks';
import { canResolve, conflictsDispatch } from '../../shared/fix-conflicts';
import type { OrcaDispatchRequest } from '../../shared/orca';
import { launchLine, phoneAgent } from '../../shared/agent-models';
import { useOrcaModels } from '../orca/ModelFields';
import { orcaChoiceFor } from '../useFixChecks';
import { PhoneFixBot } from './PhoneFix';
import { phoneFixItems, phoneFixTitle } from './phone-fix';
import { isProjectStatus } from '../../shared/project-status';
import { api } from '../api';
import { loadWrap, saveWrap } from '../diff-view';
import { useRemote } from '../useRemote';
import { actionItems, type ActionContext, type ActionItem } from './action-items';
import { PhoneActionSheet, PhoneConfirm } from './PhoneActionSheet';
import { PhoneComposer, clearDraft } from './PhoneComposer';
import { PhoneDiffSheet } from './PhoneDiffSheet';
import { PhoneEditTitle } from './PhoneEditTitle';
import { PhoneFormPicker, PhoneIssuePicker } from './PhoneIssuePicker';
import { PhoneIssueSheet } from './PhoneIssueSheet';
import { PhonePrSheet } from './PhonePrSheet';
import type { ConfirmKind, ComposerMode, FixMode } from './sheet-stack';
import type { SheetStack } from './useSheetStack';
import { bot, projectStatuses, statusOption } from '../org-settings';
import { copyLink, shareLink } from './link-actions';
import { usePhonePr } from './usePhonePr';
import { usePhoneWrites } from './usePhoneWrites';
import { PhoneCreateSubIssue, PhoneRemoveSub, PhoneSubRowSheet } from './PhoneSubIssues';
import { openExternal } from '../links';
import { repoLabel } from '../repo-label';

interface PhoneSheetsProps {
  sheets: SheetStack;
  prs: readonly PrSummary[];
  issues: readonly IssueSummary[];
  viewer: string;
  /** The org project's Status options resolved; Start work also sets the status. */
  projectStatus: boolean;
  writesOff: boolean;
  /** Reloads the inbox lists after a write. */
  onChanged: () => void;
}

const isStatusAction = (id: string): boolean => id.startsWith('status:');

const COMPOSER_TITLE: Record<ComposerMode, string> = { comment: 'Comment', request: 'Request changes', description: 'Description' };

/** How long the form waits for the refetched list to contain the new issue. */
const CREATED_WAIT_MS = 8000;

/** Renders every open level, bottom to top. Parents stay mounted so their scroll survives. */
export function PhoneSheets({ sheets, prs, issues, viewer, projectStatus, writesOff, onChanged }: PhoneSheetsProps) {
  const { stack, push, replaceTop, replaceRoot, pop } = sheets;
  const root = stack[0];
  const pr = root?.kind === 'pr' ? prs.find((x) => x.id === root.id) : undefined;
  const issue = root?.kind === 'issue' ? issues.find((x) => x.id === root.id) : undefined;
  const [wrap, setWrap] = useState(loadWrap);
  const [dispatching, setDispatching] = useState(false);
  const models = useOrcaModels();
  const [form, setForm] = useState<NewIssueForm>(() => emptyForm(''));
  const [created, setCreated] = useState<{ repo: string; number: number }>();

  const reload = useRef<() => void>(() => undefined);
  const changed = useCallback(() => {
    onChanged();
    reload.current();
  }, [onChanged]);
  const writes = usePhoneWrites(changed);
  const { notify } = writes;
  const prData = usePhonePr(pr, (m) => writes.notify(m, false));
  const issueDetail = useRemote(issue ? `issue:${issue.id}` : null, () =>
    api.issueDetail(issue?.repo ?? '', issue?.number ?? 0),
  );
  const postRetry = useCallback(
    (a: IssueAction) => writes.issue(a, `Asked ${bot().name} to retry`, `Could not ask ${bot().name} to retry`),
    [writes.issue],
  );
  const retry = useBotRetry(issueDetail.data, viewer, postRetry);
  const postSplit = useCallback(
    (a: IssueAction) => writes.issue(a, `Asked ${bot().name} to split`, `Could not ask ${bot().name} to split`),
    [writes.issue],
  );
  const split = useBotSplit(retry.detail, viewer, postSplit, changed);
  const postCheck = useCallback(
    (a: IssueAction) => writes.issue(a, `Asked ${bot().name} to check`, `Could not ask ${bot().name} to check`),
    [writes.issue],
  );
  const botCheck = useBotCheck(issueDetail.data, viewer, postCheck);
  const postTrim = useCallback(
    (a: IssueAction) => writes.issue(a, `Asked ${bot().name} to trim`, `Could not ask ${bot().name} to trim`),
    [writes.issue],
  );
  const botTrim = useBotTrim(issueDetail.data, viewer, postTrim, () => issueDetail.reload());
  const botView = phoneBotState(botCheck.state, botTrim.state, issueDetail.data?.comments ?? []);
  const orca = useRemote('orca', () => api.orca());
  reload.current = () => {
    prData.reload();
    issueDetail.reload();
  };

  const access = pr
    ? reviewAccess({
        author: pr.author,
        viewer,
        viewerCanMergeAsAdmin: prData.detail.data?.viewerCanMergeAsAdmin,
        headCommitLogins: prData.detail.data?.headCommitLogins,
        ci: prData.detail.data?.summary.ci ?? 'none',
        isDraft: prData.detail.data?.summary.isDraft ?? pr.isDraft,
      })
    : NO_ACCESS;
  // Until the detail loads there are no checks to read, so Admin merge stays off.
  const adminKnown = !!prData.detail.data;

  const detail = prData.detail.data;
  const failing = detail ? failingChecks(detail.checks) : [];
  const fixable = !!pr && !!detail && canFix(detail);
  const conflicting = !!pr && !!detail && canResolve(detail);
  const orcaFix = orcaChoiceFor(detail, orca.data);

  const ctx: ActionContext = {
    fix: fixable ? { count: failing.length, orca: orcaFix !== 'absent' } : undefined,
    conflicts: conflicting,
    target: pr ? 'pr' : 'issue',
    ownPr: access.ownPr,
    isAdmin: access.admin !== 'hidden',
    adminReady: access.admin === 'ready' && adminKnown,
    draft: access.draft,
    // Dispatch starts from an issue; the server reports whether Orca has its repo.
    orcaAvailable: !!issue && repoInOrca(orca.data, issue.repo),
    issueOpen: issue?.state !== 'closed',
    assignedToViewer: !!issue?.assignees.includes(viewer),
    projectStatus,
    status: issue?.status,
    writesOff,
    canShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    repo: issue?.repo,
    number: issue?.number,
    withBot: !!issue && hasBotLabel(issue.labels, bot()),
    botRetry: retry.state,
    botSplit: { state: split.state, parts: split.parts.length },
    botState: botView,
    busy: writes.busy,
  };

  // The created issue opens as a new root once the refetched list has it.
  const madeIssue = created && issues.find((x) => x.repo === created.repo && x.number === created.number);
  useEffect(() => {
    if (!madeIssue) return;
    replaceRoot({ kind: 'issue', id: madeIssue.id });
    setCreated(undefined);
  }, [madeIssue, replaceRoot]);
  useEffect(() => {
    if (!created) return;
    // The issue exists but the list never showed it, so say where it is instead of closing silently.
    const t = setTimeout(() => {
      setCreated(undefined);
      pop();
      notify(`Created ${repoLabel(created.repo)} #${created.number}. Refresh to see it in the list.`);
    }, CREATED_WAIT_MS);
    return () => clearTimeout(t);
  }, [created, pop, notify]);

  const openGithub = () => window.open((pr ?? issue)?.url, '_blank', 'noopener,noreferrer');

  const subs = issueDetail.data?.subIssues ?? [];
  const subChild = (id: string) => subs.find((c) => c.id === id);

  /** A related issue opens as the new root when it is listed, and on GitHub otherwise. */
  const openRelated = (r: { id: string; repo: string; number: number; url?: string }) => {
    const hit = issues.find((x) => x.id === r.id || (x.repo === r.repo && x.number === r.number));
    if (hit) push({ kind: 'issue', id: hit.id });
    else openExternal(r.url ?? `https://github.com/${r.repo}/issues/${r.number}`);
  };

  const createSub = async () => {
    if (!issue) return;
    const ok = await writes.issue(
      { type: 'sub-create', repo: issue.repo, number: issue.number, childRepo: form.repo, title: form.title.trim(), body: form.body },
      `Created a sub-issue under #${issue.number}`,
      'Could not create sub-issue',
    );
    if (!ok) return;
    issueDetail.reload();
    pop();
  };

  const removeSub = async (id: string) => {
    const child = subChild(id);
    if (!issue || !child) return;
    const ok = await writes.issue(
      { type: 'sub-remove', repo: issue.repo, number: issue.number, childId: id },
      `Removed #${child.number} from #${issue.number}`,
      `Could not remove #${child.number}`,
    );
    issueDetail.reload();
    if (ok) pop();
  };

  const runIssue = async (id: string): Promise<void> => {
    if (!issue) return;
    const ref = { repo: issue.repo, number: issue.number };
    if (id === 'start-work' && projectStatus) {
      await writes.issue({ type: 'start', ...ref }, `Started, assigned to you and ${statusOption('inProgress')}`);
    } else if (id === 'stop-work') {
      await writes.issue({ type: 'stop', ...ref }, 'Stopped, status Ready');
    } else if (isStatusAction(id)) {
      const status = id.slice('status:'.length);
      if (isProjectStatus(status, projectStatuses())) await writes.issue({ type: 'status', ...ref, status }, `Status set to ${status}`);
    } else if (id === 'start-work' || id === 'assign-me') {
      await writes.issue({ type: 'assignees', ...ref, add: [viewer], remove: [] }, id === 'assign-me' ? `Assigned to ${viewer}` : 'Started, assigned to you');
    } else if (id === 'mark-done' || id === 'close-completed') await writes.closeIssue(ref.repo, ref.number, 'COMPLETED');
    else if (id === 'close-not-planned') await writes.closeIssue(ref.repo, ref.number, 'NOT_PLANNED');
    else if (id === 'reopen') await writes.issue({ type: 'reopen', ...ref }, 'Issue reopened');
  };

  const runRow = (item: ActionItem) => {
    if (item.id === 'comment') return replaceTop({ kind: 'composer', mode: 'comment' });
    if (item.id === 'request-changes') return replaceTop({ kind: 'composer', mode: 'request' });
    if (item.id === 'auto-merge' || item.id === 'admin-merge' || item.id === 'ready' || item.id === 'dispatch') {
      return replaceTop({ kind: 'confirm', action: item.id });
    }
    if (item.id === 'fix-checks') return replaceTop({ kind: 'fix', mode: 'checks' });
    if (item.id === 'fix-conflicts') return replaceTop({ kind: 'fix', mode: 'conflicts' });
    if (item.id === 'edit-title') return replaceTop({ kind: 'edit-title' });
    if (item.id === 'hand-bot') return replaceTop({ kind: 'confirm', action: 'bot' });
    if (item.id === 'bot-retry') {
      retry.request();
      return pop();
    }
    if (item.id === 'bot-split') return replaceTop({ kind: 'bot-split' });
    if (item.id === 'bot-check') {
      botCheck.request();
      return pop();
    }
    if (item.id === 'bot-trim') {
      botTrim.request();
      return pop();
    }
    if (item.id === 'new-issue' && issue) {
      setForm(emptyForm(issue.repo));
      return replaceTop({ kind: 'new-issue' });
    }
    if (item.id === 'new-sub-issue' && issue) {
      setForm(emptyForm(issue.repo));
      return replaceTop({ kind: 'sub-create' });
    }
    if (item.id === 'open-github') openGithub();
    else if (item.id === 'copy-link' || item.id === 'share-link') {
      const target = pr ?? issue;
      if (target) {
        const run = item.id === 'copy-link' ? copyLink(target.url) : shareLink(target.title, target.url);
        void run.then((r) => r && writes.notify(r.message, r.ok));
      }
    }
    else void runIssue(item.id);
    pop();
  };

  /**
   * Starts an Orca worktree with the default prompt, then runs Start work. The agent is the one last
   * dispatched with; the server adds that agent's remembered model.
   */
  const dispatch = async () => {
    if (!issue) return;
    const { repo, number, title, url } = issue;
    setDispatching(true);
    const agent = phoneAgent(orca.data?.agents ?? [], models, DEFAULT_AGENT);
    try {
      const res = await api.orcaDispatch({
        repo,
        number,
        agent,
        name: worktreeName(number, title),
        prompt: dispatchPrompt(repo, number, title, url),
      });
      const ref = { repo, number };
      const started = projectStatus
        ? await writes.issue({ type: 'start', ...ref }, `Dispatched to ${res.worktree}. ${statusOption('inProgress')}.`)
        : await writes.issue(
            { type: 'assignees', ...ref, add: [viewer], remove: [] },
            `Dispatched to ${res.worktree}. Assigned to you.`,
          );
      if (!started) writes.notify(`Dispatched to ${res.worktree}, but Start work failed`, false);
    } catch (e) {
      writes.notify(e instanceof Error ? e.message : 'Dispatch failed', false);
    } finally {
      setDispatching(false);
    }
  };

  const [fixDone, setFixDone] = useState<string>();

  /** Posts the bot command comment. The sheet stays open on failure. */
  const postFixComment = async (comment: string) => {
    if (!pr) return;
    const ref = `${repoLabel(pr.repo)} #${pr.number}`;
    setDispatching(true);
    try {
      const res = await api.prComment(pr.repo, pr.number, comment);
      if (!res.ok) throw new Error(res.message);
      writes.notify(res.message);
      changed();
      pop();
    } catch (e) {
      writes.notify(`Could not post comment on ${ref}: ${e instanceof Error ? e.message : 'Request failed'}`, false);
    } finally {
      setDispatching(false);
    }
  };

  /**
   * The desktop's one-tap fix dispatch: a worktree on the PR head with the desktop prompt and the agent
   * last dispatched with. The confirm stays open, showing Done on success and re-armed on failure.
   */
  const dispatchFix = async (mode: FixMode) => {
    if (!detail || orcaFix !== 'ready') return;
    const agent = phoneAgent(orca.data?.agents ?? [], models, DEFAULT_AGENT);
    setDispatching(true);
    try {
      const res = await api.orcaDispatch(mode === 'conflicts' ? conflictsDispatch(detail, agent) : checksDispatch(detail, agent));
      setFixDone(`Dispatched to ${res.worktree}`);
      writes.notify(`Dispatched to ${res.worktree}`);
    } catch (e) {
      writes.notify(`Could not dispatch: ${e instanceof Error ? e.message : 'Dispatch failed'}`, false);
    } finally {
      setDispatching(false);
    }
  };

  const fixItems = (mode: FixMode): ActionItem[] => {
    const items = phoneFixItems({ mode, orca: orcaFix, writesOff, busy: dispatching });
    return mode === 'conflicts' && pr ? [...items, { id: 'open-github', label: 'Resolve on GitHub' }] : items;
  };

  const runFix = (mode: FixMode, item: ActionItem) => {
    if (item.id === 'fix-bot' && mode === 'checks') return replaceTop({ kind: 'fix-bot' });
    if (item.id === 'fix-dispatch') {
      setFixDone(undefined);
      return replaceTop({ kind: 'confirm', action: `fix-${mode}` });
    }
    if (item.id === 'open-github') openGithub();
    pop();
  };

  /** Renames the issue and closes the sheet; on failure it stays open with the server message in a toast. */
  const renameIssue = async (title: string) => {
    if (!issue) return;
    const ref = `${repoLabel(issue.repo)} #${issue.number}`;
    const ok = await writes.issue(
      { type: 'title', repo: issue.repo, number: issue.number, title },
      `Title updated on ${ref}`,
      `Could not rename ${ref}`,
    );
    if (ok) pop();
  };

  /** Creates the issue. Success waits for the list to refetch, then the effect above opens it. */
  const createIssue = async () => {
    const made = await writes.createIssue(createAction(form));
    if (!made) return;
    clearDraft(descriptionDraftKey(form.repo));
    // Without a number there is nothing to wait for; the toast already says it was created.
    if (made.number === undefined) pop();
    else setCreated({ repo: form.repo, number: made.number });
  };

  /** Adds the bot's label. The dialog stays open on failure so the user can retry. */
  const handToBot = async (): Promise<boolean> => {
    if (!issue) return false;
    const ref = `${repoLabel(issue.repo)} #${issue.number}`;
    const { name } = bot();
    return writes.issue(
      { type: 'bot', repo: issue.repo, number: issue.number },
      `${name} picked up ${ref}`,
      `Could not hand ${ref} to ${name}`,
    );
  };

  const confirm = async (kind: ConfirmKind) => {
    if (kind === 'bot') {
      if (await handToBot()) pop();
      return;
    }
    if (kind === 'fix-checks' || kind === 'fix-conflicts') {
      await dispatchFix(kind === 'fix-checks' ? 'checks' : 'conflicts');
      return;
    }
    if (kind === 'dispatch') await dispatch();
    else if (kind === 'auto-merge' && pr) await writes.autoMerge(pr);
    else if (kind === 'admin-merge' && pr && access.admin === 'ready') await writes.adminMerge(pr);
    else if (kind === 'ready' && pr && access.draft) await writes.markReady(pr);
    else writes.notify('Not available in this build', false);
    pop();
  };

  const submit = async (mode: ComposerMode, body: string) => {
    if (mode === 'description') {
      setForm((f) => ({ ...f, body }));
      return pop();
    }
    let ok = false;
    if (pr) ok = await writes.review(pr, mode === 'request' ? 'REQUEST_CHANGES' : 'COMMENT', body);
    else if (issue) ok = await writes.issue({ type: 'comment', repo: issue.repo, number: issue.number, body }, 'Comment posted');
    if (!ok) return;
    clearDraft(`phone-draft:${(pr ?? issue)?.id ?? ''}`);
    pop();
  };

  const subject = pr ? `${repoLabel(pr.repo)} #${pr.number} ${pr.title}` : issue ? `${repoLabel(issue.repo)} #${issue.number} ${issue.title}` : '';
  const last = stack.length - 1;

  return (
    <>
      {stack.map((level, i) => {
        const covered = i < last;
        switch (level.kind) {
          case 'pr':
            return pr ? (
              <PhonePrSheet
                key="pr"
                pr={pr}
                viewer={viewer}
                data={prData}
                writesOff={writesOff}
                busy={writes.busy}
                depth={i}
                covered={covered}
                onClose={pop}
                onFile={(path) => push({ kind: 'diff', path })}
                onMore={() => push({ kind: 'actions' })}
                onApprove={() => void writes.review(pr, 'APPROVE', '')}
                onComment={() => push({ kind: 'composer', mode: 'comment' })}
                {...(fixable ? { onFixChecks: () => push({ kind: 'fix', mode: 'checks' }) } : {})}
                {...(conflicting ? { onFixConflicts: () => push({ kind: 'fix', mode: 'conflicts' }) } : {})}
              />
            ) : null;
          case 'issue':
            return issue ? (
              <PhoneIssueSheet
                key="issue"
                issue={issue}
                viewer={viewer}
                projectStatus={projectStatus}
                detail={{ ...issueDetail, data: split.detail }}
                bot={botView}
                writesOff={writesOff}
                busy={writes.busy}
                depth={i}
                covered={covered}
                onClose={pop}
                onMore={() => push({ kind: 'actions' })}
                onPrimary={(id) => void runIssue(id)}
                onComment={() => push({ kind: 'composer', mode: 'comment' })}
                onPick={(field) => push({ kind: 'picker', field })}
                sub={{
                  onOpen: openRelated,
                  onLong: (c) => push({ kind: 'sub-row', id: c.id }),
                  onCreate: () => {
                    setForm(emptyForm(issue.repo));
                    push({ kind: 'sub-create' });
                  },
                  onParent: openRelated,
                }}
              />
            ) : null;
          case 'sub-create':
            return issue ? (
              <PhoneCreateSubIssue
                key="sub-create"
                parent={issue}
                form={form}
                writesOff={writesOff}
                busy={writes.busy}
                depth={i}
                covered={covered}
                onChange={setForm}
                onPickRepo={() => push({ kind: 'form-picker', field: 'repository' })}
                onCreate={() => void createSub()}
                onClose={pop}
              />
            ) : null;
          case 'sub-row': {
            const child = subChild(level.id);
            return issue && child ? (
              <PhoneSubRowSheet
                key="sub-row"
                parentNumber={issue.number}
                parentRepo={issue.repo}
                child={child}
                writesOff={writesOff}
                onOpen={() => {
                  pop();
                  openRelated(child);
                }}
                onGithub={() => {
                  pop();
                  openExternal(child.url);
                }}
                onRemove={() => replaceTop({ kind: 'sub-remove', id: child.id })}
                onClose={pop}
              />
            ) : null;
          }
          case 'sub-remove': {
            const child = subChild(level.id);
            return issue && child ? (
              <PhoneRemoveSub
                key="sub-remove"
                parentNumber={issue.number}
                child={child}
                busy={writes.busy}
                onConfirm={() => void removeSub(child.id)}
                onCancel={pop}
              />
            ) : null;
          }
          case 'edit-title':
            return issue ? (
              <PhoneEditTitle
                key="edit-title"
                current={issue.title}
                issueRef={`${repoLabel(issue.repo)} #${issue.number}`}
                writesOff={writesOff}
                busy={writes.busy}
                onSave={(title) => void renameIssue(title)}
                onClose={pop}
              />
            ) : null;
          case 'new-issue':
            return (
              <PhoneNewIssue
                key="new-issue"
                form={form}
                writesOff={writesOff}
                busy={writes.busy || !!created}
                depth={i}
                covered={covered}
                onChange={setForm}
                onPick={(field) => push({ kind: 'form-picker', field })}
                onDescription={() => push({ kind: 'composer', mode: 'description' })}
                onCreate={() => void createIssue()}
                onClose={pop}
              />
            );
          case 'form-picker':
            return (
              <PhoneFormPicker
                key={`form-picker:${level.field}`}
                field={level.field}
                form={form}
                repos={issueRepos(issues)}
                viewer={viewer}
                depth={i}
                covered={covered}
                onApply={setForm}
                onNotify={(m) => writes.notify(m)}
                onClose={pop}
              />
            );
          case 'picker':
            return issue ? (
              <PhoneIssuePicker
                key={`picker:${level.field}`}
                field={level.field}
                issue={issue}
                detail={issueDetail}
                viewer={viewer}
                writes={writes}
                depth={i}
                covered={covered}
                onClose={pop}
              />
            ) : null;
          case 'diff':
            return pr ? (
              <PhoneDiffSheet
                key="diff"
                files={prData.files}
                diff={prData.diff}
                path={level.path}
                prUrl={pr.url}
                wrap={wrap}
                writesOff={writesOff}
                depth={i}
                covered={covered}
                onWrap={() => {
                  saveWrap(!wrap);
                  setWrap(!wrap);
                }}
                onSelect={(path) => replaceTop({ kind: 'diff', path })}
                onViewed={(path, v) => void prData.toggleViewed(path, v)}
                onClose={pop}
                onMore={() => push({ kind: 'actions' })}
              />
            ) : null;
          case 'actions':
            return (
              <PhoneActionSheet
                key="actions"
                title={subject.split(' ').slice(0, 2).join(' ') + ' · actions'}
                items={actionItems(ctx)}
                onRun={runRow}
                onClose={pop}
              />
            );
          case 'fix':
            return (level.mode === 'checks' ? fixable : conflicting) ? (
              <PhoneActionSheet
                key={`fix:${level.mode}`}
                title={phoneFixTitle(level.mode)}
                items={fixItems(level.mode)}
                onRun={(item) => runFix(level.mode, item)}
                onClose={pop}
              />
            ) : null;
          case 'bot-split':
            return issue && split.state === 'offered' ? (
              <PhoneBotSplit
                key="bot-split"
                number={issue.number}
                parts={split.parts}
                onSplit={() => {
                  split.request();
                  pop();
                }}
                onClose={pop}
              />
            ) : null;
          case 'fix-bot':
            return pr && fixable ? (
              <PhoneFixBot
                key="fix-bot"
                subject={`${repoLabel(pr.repo)} #${pr.number}`}
                count={failing.length}
                initial={botComment(failing, bot())}
                busy={dispatching}
                onPost={(c) => void postFixComment(c)}
                onCancel={pop}
              />
            ) : null;
          case 'confirm': {
            const fixing = level.action === 'fix-checks' || level.action === 'fix-conflicts';
            return (
              <PhoneConfirm
                key="confirm"
                kind={level.action}
                subject={subject}
                issue={issue ? { repo: issue.repo, number: issue.number } : undefined}
                busy={writes.busy || dispatching}
                requireNumber={level.action === 'admin-merge' ? pr?.number : undefined}
                {...(level.action === 'dispatch' || fixing
                  ? {
                      detail: {
                        line: launchLine(phoneAgent(orca.data?.agents ?? [], models, DEFAULT_AGENT), models),
                        sub: 'the model you last chose on the desktop',
                      },
                    }
                  : {})}
                {...(fixing && fixDone ? { done: fixDone } : {})}
                onConfirm={() => void confirm(level.action)}
                onCancel={pop}
              />
            );
          }
          case 'composer':
            return (
              <PhoneComposer
                key="composer"
                draftKey={level.mode === 'description' ? descriptionDraftKey(form.repo) : `phone-draft:${(pr ?? issue)?.id ?? ''}`}
                title={
                  level.mode === 'description'
                    ? 'Description'
                    : `${COMPOSER_TITLE[level.mode]} · ${subject.split(' ').slice(0, 2).join(' ')}`
                }
                fieldLabel={level.mode === 'description' ? 'Description' : undefined}
                submitLabel={level.mode === 'request' ? 'Request changes' : level.mode === 'description' ? 'Done' : 'Comment'}
                initialText={level.mode === 'description' ? form.body : undefined}
                allowEmpty={level.mode === 'description'}
                repo={level.mode === 'description' ? form.repo : (pr ?? issue)?.repo}
                onUploadError={(m) => writes.notify(m, false)}
                writesOff={level.mode === 'description' ? false : writesOff}
                busy={writes.busy}
                onSubmit={(body) => void submit(level.mode, body)}
                onClose={pop}
              />
            );
        }
      })}
      {writes.toast ? (
        <div className={`ph-toast${writes.toast.ok ? '' : ' is-error'}`} role="status">
          {writes.toast.message}
        </div>
      ) : null}
    </>
  );
}
