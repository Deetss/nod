import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runBulk, type BulkFailure } from '../../shared/bulk';
import { DEFAULT_ISSUE_COLLAPSED } from '../../shared/issue-sections';
import type {
  CloseReason,
  IssueAction,
  IssueActionResult,
  IssueSectionKey,
  IssueSummary,
  SubIssue,
} from '../../shared/issue-types';
import { repoInOrca, type OrcaDispatchRequest } from '../../shared/orca';
import type { ProjectStatus } from '../../shared/project-status';
import { STATE_PARAM, api } from '../api';
import type { Layout } from '../hooks';
import { PaneHandle } from '../PaneHandle';
import { usePaneWidths } from '../usePaneWidths';
import { useRemote } from '../useRemote';
import { BulkReport, CloseDialog, DispatchDialog, BotDialog, NewIssueDialog } from './IssueDialogs';
import { IssueDetailPane } from './IssueDetailPane';
import { IssueListPane } from './IssueListPane';
import { ActionsPanel, MetadataCards } from './IssueSidebar';
import {
  buildIssueSections,
  DEFAULT_ISSUE_FILTER,
  issueLabelNames,
  issueRepos,
  issueWalkOrder,
  matchesIssue,
  type IssueFilter,
} from './issue-filter';
import { refOf, type IssueRef } from './issue-utils';
import { resolveEffective } from './stable';
import { LabelChip } from './parts';
import { Picker, type PickerItem } from './Picker';
import { bulkPickerOrder } from './picker-state';
import { bot, statusOption } from '../org-settings';
import { hasBotLabel } from '../../shared/bot';
import { scrollRowIntoView } from '../list-view';
import { useIssueHotkeys } from './useIssueHotkeys';
import { FOOTER_SUB_ISSUE_ROW, type KeyDef } from '../keys';
import { AddExistingPicker, CreateSubIssueDialog, RemoveSubIssueDialog } from './SubIssueDialogs';
import { SubIssuesCard, subRowEl } from './SubIssuesCard';
import { useSubIssues } from './useSubIssues';
import { useBotRetry } from './useBotRetry';
import { useBotSplit } from './useBotSplit';
import { useBotCheck, useBotTrim } from './useBotCheck';
import { BotCheckCard, BotCheckStrip } from './BotCheckCard';
import { emphasisFor, checkCardOf } from './bot-card';
import { SplitDialog } from './SplitDialog';
import { useIssueOrca, type PendingDispatch } from '../orca/useIssueOrca';
import type { IssuesState } from './useIssues';
import { useSeenOnView } from '../useSeenOnView';
import { repoLabel } from '../repo-label';
import { ClosedRow, ClosedSection } from '../ClosedSection';
import { captureSelectsClosed, useClosed } from '../useClosed';
import { closedIssueState, isClosedIssue, type ClosedIssue } from '../../shared/closed';

export interface IssueTarget {
  repo: string;
  number: number;
  /** Bumps on each request so the same issue can be picked twice. */
  n: number;
}

interface IssuesViewProps {
  state: IssuesState;
  layout: Layout;
  /** Issue ids the user opened this session. */
  seenLocal: ReadonlySet<string>;
  onSeen: (id: string) => void;
  /** An issue another part of the app wants shown (search, notification). */
  target: IssueTarget | undefined;
  /** False while the PR view is showing, so nothing here reacts to keys. */
  active: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpenPr: (repo: string, number: number) => void;
  onHelp: () => void;
  onGoPrs: () => void;
  onPair: () => void;
  onRefresh: () => void;
  /** Called with a successful write's response, so the app can show an Orca notification result. */
  onNotice?: (res: { noticeId?: string }) => void;
  /** The footer hints the Orca strip adds while it shows a session. */
  onOrcaHints?: (hints: KeyDef[]) => void;
  /** Keys that replace the footer while a sub-issue row has focus; undefined restores it. */
  onFooterKeys?: (keys: KeyDef[] | undefined) => void;
}

/** Fixture captures that open a sub-issue state on the selected issue. */
const SUB_STATES = ['issues-sub-create', 'issues-sub-add', 'issues-sub-remove'];

interface Toast {
  ok: boolean;
  message: string;
  retry?: () => void;
}

type PickerKind = 'labels' | 'assign' | 'milestone';

interface PickerState {
  kind: PickerKind;
  /** Applies to every checked issue instead of the open one. */
  bulk: boolean;
  /** Set by the new issue form, which collects the picks instead of running a write. */
  collect?: (picked: string[]) => void;
  current?: string[];
}

interface Closing {
  targets: IssueRef[];
  reason: CloseReason;
}

interface BulkOutcome {
  title: string;
  total: number;
  failures: BulkFailure<IssueRef>[];
  retry: () => void;
}

const FIXTURE_BULK = ['acme-dev/tools#63', 'acme-dev/notes#17', 'acme-co/acme-web#288'];

export function IssuesView(p: IssuesViewProps) {
  const { data } = p.state;
  const layout = p.layout;

  const [filters, setFilters] = useState<IssueFilter>(DEFAULT_ISSUE_FILTER);
  const [collapsed, setCollapsed] = useState<ReadonlySet<IssueSectionKey>>(new Set(DEFAULT_ISSUE_COLLAPSED));
  const [selected, setSelected] = useState<IssueRef>();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [picker, setPicker] = useState<PickerState>();
  const [closing, setClosing] = useState<Closing>();
  const [newOpen, setNewOpen] = useState(false);
  const [newRepo, setNewRepo] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>();
  const [outcome, setOutcome] = useState<BulkOutcome>();
  const [unseenMap, setUnseenMap] = useState<Record<string, number>>({});
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<string>();
  const [botOpen, setBotOpen] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [subDialog, setSubDialog] = useState<'create' | 'add'>();
  const [removing, setRemoving] = useState<{ child: SubIssue; next: string | undefined }>();
  /** Issue id to its comment count at dispatch; the row chip shows until the count moves. */
  const [dispatched, setDispatched] = useState<ReadonlyMap<string, number>>(new Map());
  /** Issue id to the worktree a dispatch created, shown as pending until Orca reports the session. */
  const [pendingDispatch, setPendingDispatch] = useState<ReadonlyMap<string, PendingDispatch>>(new Map());
  const orca = useRemote('orca', () => api.orca());

  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const panesRef = useRef<HTMLElement>(null);
  const opened = useRef(new Set<string>());
  const scrolledFor = useRef<string | undefined>(undefined);
  const cursor = useRef(-1);
  const initialDone = useRef(false);

  const pw = usePaneWidths(layout === 'three' ? 'issues' : 'issues-two', panesRef);
  const handle = (i: number, label: string) => (
    <PaneHandle
      label={label}
      value={pw.widths[i] ?? 0}
      min={pw.min(i)}
      max={pw.max(i)}
      onResize={(px) => pw.setWidth(i, px)}
      onReset={pw.reset}
    />
  );

  // Rows the user opened this session read as seen at once, before the server confirms.
  const everyIssue = useMemo(
    () =>
      (data?.issues ?? []).map((i) =>
        p.seenLocal.has(i.id) ? { ...i, seen: 'seen' as const, updatedNote: undefined } : i,
      ),
    [data?.issues, p.seenLocal],
  );
  const sections = useMemo(
    () =>
      data
        ? buildIssueSections({ ...data, issues: everyIssue }, filters, collapsed)
        : [],
    [data, everyIssue, filters, collapsed],
  );

  // j and k walk the open rows, then the closed rows once that section is open.
  const closed = useClosed<ClosedIssue>(api.closedIssues);
  const firstClosed = closed.state.items[0];
  useEffect(() => {
    if (captureSelectsClosed() && firstClosed) setSelected((s) => s ?? refOf(firstClosed));
  }, [firstClosed]);
  const closedRows = useMemo(
    () => (closed.state.open ? closed.state.items.filter((i) => matchesIssue(i, filters)) : []),
    [closed.state.open, closed.state.items, filters],
  );
  const known = useMemo(() => [...everyIssue, ...closed.state.items], [everyIssue, closed.state.items]);
  const order = useMemo(
    () => [...issueWalkOrder(sections), ...closedRows.map((i) => i.id)],
    [sections, closedRows],
  );
  const first = everyIssue.find((i) => i.id === order[0]) ?? closedRows.find((i) => i.id === order[0]);
  const pinnedId = useRef<string | undefined>(undefined);
  const effectiveRef = resolveEffective(selected, pinnedId.current, known, first);
  pinnedId.current = effectiveRef?.id;
  // Same ref values keep the same identity so memo deps stay quiet.
  const effective = useMemo(() => effectiveRef, [effectiveRef?.id, effectiveRef?.repo, effectiveRef?.number]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = data?.stale !== undefined;

  const detail = useRemote(effective ? `idetail:${effective.id}` : null, () =>
    api.issueDetail(effective?.repo ?? '', effective?.number ?? 0),
  );
  const d = detail.data;
  const unseenFrom = d ? (unseenMap[d.summary.id] ?? d.unseenFrom) : 0;
  const disabled = stale || (d?.stale !== undefined && d.stale.kind === 'ratelimit');

  // The first detail load per issue fixes which comments read as NEW for the session.
  useEffect(() => {
    if (d && unseenMap[d.summary.id] === undefined) {
      setUnseenMap((m) => ({ ...m, [d.summary.id]: d.unseenFrom }));
    }
  }, [d, unseenMap]);

  // A new thread scrolls so the first unseen comment is in view, otherwise to the top.
  useEffect(() => {
    if (!d || scrolledFor.current === d.summary.id) return;
    scrolledFor.current = d.summary.id;
    cursor.current = -1;
    const t = setTimeout(() => {
      const box = threadRef.current;
      if (!box) return;
      const unseen = box.querySelector<HTMLElement>('[data-unseen="1"]');
      if (unseen) unseen.scrollIntoView({ block: 'nearest' });
      else box.scrollTop = 0;
    }, 0);
    return () => clearTimeout(t);
  }, [d]);

  // An opened issue stays marked seen after its own comments and edits move updatedAt.
  const stamp = d?.summary.updatedAt;
  useEffect(() => {
    if (d && opened.current.has(d.summary.id)) void api.issueSeen(d.summary).catch(() => undefined);
    // Only a new updatedAt matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  // The list follows the detail after a write, so labels and counts update at once.
  useEffect(() => {
    if (stamp) p.state.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  useEffect(() => {
    if (!toast || toast.retry) return;
    const t = setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Keyboard focus starts on the list.
  const focused = useRef(false);
  useEffect(() => {
    if (data && p.active && !focused.current) {
      focused.current = true;
      listRef.current?.focus({ preventScroll: true });
    }
  }, [data, p.active]);

  const find = useCallback(
    (repo: string, number: number) => known.find((i) => i.repo === repo && i.number === number),
    [known],
  );

  const select = useCallback((issue: IssueSummary) => setSelected(refOf(issue)), []);

  const openIssue = useCallback(
    (issue: IssueSummary) => {
      setSelected(refOf(issue));
      // A closed issue is read-only, so opening it records nothing.
      if (!isClosedIssue(issue)) {
        opened.current.add(issue.id);
        p.onSeen(issue.id);
        void api.issueSeen(issue).catch(() => undefined);
      }
      if (layout === 'one') setShowDetail(true);
      setTimeout(() => threadRef.current?.focus({ preventScroll: true }), 0);
    },
    [layout, p],
  );

  // An issue shown in the detail pane counts as seen after a short look, as PRs do.
  const markSeen = useCallback(
    (issue: IssueSummary) => {
      p.onSeen(issue.id);
      void api.issueSeen(issue).catch(() => undefined);
    },
    [p],
  );
  const detailShown = p.active && (layout !== 'one' || showDetail);
  useSeenOnView(detailShown ? everyIssue.find((i) => i.id === effective?.id) : undefined, markSeen);
  // Search and notification clicks land here.
  useEffect(() => {
    const t = p.target;
    if (!t) return;
    const hit = find(t.repo, t.number);
    setFilters(DEFAULT_ISSUE_FILTER);
    setCollapsed((c) => {
      const n = new Set(c);
      n.delete('all');
      return n;
    });
    if (hit) {
      openIssue(hit);
      scrollRowIntoView(hit.id);
    } else setSelected({ id: `I_${t.repo}_${t.number}`, repo: t.repo, number: t.number });
    // Run per request only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.target?.n]);

  const move = useCallback(
    (delta: number) => {
      if (order.length === 0) return;
      const i = order.findIndex((id) => id === effective?.id);
      const nextId = order[Math.min(order.length - 1, Math.max(0, i + delta))];
      const next = known.find((x) => x.id === nextId);
      if (!next) return;
      setSelected(refOf(next));
      scrollRowIntoView(next.id);
    },
    [order, known, effective?.id],
  );

  const toggleSection = useCallback((key: IssueSectionKey) => {
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const toggleCheck = useCallback((issue: IssueSummary) => {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(issue.id)) n.delete(issue.id);
      else n.add(issue.id);
      return n;
    });
  }, []);

  // Writes -----------------------------------------------------------------------------

  const write = useCallback(
    async (action: IssueAction): Promise<IssueActionResult> => {
      const res = await api.issueAction(action);
      if (!res.ok) throw new Error(res.message);
      return res;
    },
    [],
  );

  /** One write with a toast. Failure names the issue and says nothing changed. */
  const run = useCallback(
    async (action: IssueAction, what: string): Promise<boolean> => {
      const label = 'number' in action ? `${repoLabel(action.repo)} #${action.number}` : action.repo;
      setBusy(true);
      try {
        const res = await write(action);
        setToast({ ok: true, message: res.message });
        p.onNotice?.(res);
        detail.reload();
        p.state.reload();
        return true;
      } catch (e) {
        const why = e instanceof Error ? e.message : 'Request failed';
        setToast({
          ok: false,
          message: `Could not ${what} ${label}: ${why}. Nothing changed.`,
          retry: () => void run(action, what),
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [write, detail, p.state, p.onNotice],
  );

  // Sub-issues ---------------------------------------------------------------------------

  const subs = useSubIssues({
    detail: d,
    write,
    refresh: () => {
      detail.reload();
      p.state.reload();
    },
    fail: (message) => setToast({ ok: false, message }),
  });

  /** Opens a related issue in the detail pane, listed or not. */
  const openRelated = useCallback(
    (r: { id: string; repo: string; number: number }) => {
      const hit = find(r.repo, r.number);
      if (hit) {
        openIssue(hit);
        scrollRowIntoView(hit.id);
      } else setSelected({ id: r.id, repo: r.repo, number: r.number });
    },
    [find, openIssue],
  );

  const { onFooterKeys } = p;
  const subFocus = useCallback((on: boolean) => onFooterKeys?.(on ? FOOTER_SUB_ISSUE_ROW : undefined), [onFooterKeys]);
  useEffect(() => onFooterKeys?.(undefined), [onFooterKeys, d?.summary.id, p.active]);

  const startSub = useCallback(
    (kind: 'create' | 'add') => {
      if (!disabled && d) setSubDialog(kind);
    },
    [disabled, d],
  );

  const confirmRemove = useCallback(async () => {
    const r = removing;
    if (!r) return;
    setRemoving(undefined);
    if (await subs.remove(r.child.id)) {
      ((r.next && subRowEl(document, r.next)) || threadRef.current)?.focus();
    }
  }, [removing, subs]);

  const subCard = d ? (
    <SubIssuesCard
      parent={d.summary}
      rows={subs.rows}
      busyId={subs.busyId}
      disabled={disabled}
      onOpen={openRelated}
      onMove={(id, to) => void subs.move(id, to)}
      onRemove={(child, next) => setRemoving({ child, next })}
      onCreate={() => startSub('create')}
      onAdd={() => startSub('add')}
      onRowFocus={subFocus}
    />
  ) : null;

  const checkedIssues = useMemo(() => everyIssue.filter((i) => checked.has(i.id)), [everyIssue, checked]);

  /** One mutation per issue, three at a time. Successes stay, failures are listed. */
  const bulk = useCallback(
    async (title: string, targets: IssueRef[], build: (t: IssueRef) => IssueAction) => {
      setBusy(true);
      const result = await runBulk(targets, async (t) => {
        await write(build(t));
      });
      setBusy(false);
      detail.reload();
      p.state.reload();
      const failed = new Set(result.failed.map((f) => f.item.id));
      setChecked(new Set(targets.filter((t) => failed.has(t.id)).map((t) => t.id)));
      if (result.failed.length === 0) {
        setToast({ ok: true, message: `${title}: ${result.done.length} done.` });
        setChecked(new Set());
      } else {
        setOutcome({
          title: `${title} finished with errors`,
          total: targets.length,
          failures: result.failed,
          retry: () => {
            setOutcome(undefined);
            void bulk(title, result.failed.map((f) => f.item), build);
          },
        });
      }
    },
    [write, detail, p.state],
  );

  // Pickers ----------------------------------------------------------------------------

  const metaRepo = picker || newOpen ? (newOpen ? newRepo : picker?.bulk ? checkedIssues[0]?.repo : effective?.repo) : undefined;
  const meta = useRemote(metaRepo ? `meta:${metaRepo}` : null, () => api.repoMeta(metaRepo ?? ''));

  const openPicker = useCallback(
    (kind: PickerKind) => {
      if (disabled) return;
      if (checked.size > 0 && kind !== 'milestone') setPicker({ kind, bulk: true });
      else if (d) setPicker({ kind, bulk: false });
    },
    [checked.size, d, disabled],
  );

  const viewer = data?.viewer;

  /** One click, no picker: adds the viewer to every checked issue, or toggles them on the open one. */
  const assignViewer = useCallback(() => {
    if (disabled || !viewer) return;
    if (checked.size > 0) {
      void bulk('Assign me', checkedIssues.map(refOf), (t) => ({
        type: 'assignees',
        repo: t.repo,
        number: t.number,
        add: [viewer],
        remove: [],
      }));
      return;
    }
    if (!d || !effective) return;
    const mine = d.assignees.some((a) => a.login === viewer);
    void run(
      {
        type: 'assignees',
        repo: effective.repo,
        number: effective.number,
        add: mine ? [] : [viewer],
        remove: mine ? [viewer] : [],
      },
      mine ? 'unassign you from' : 'assign you to',
    );
  }, [disabled, viewer, checked.size, checkedIssues, bulk, d, effective, run]);

  const statusOn = data?.projectStatus === true;

  /**
   * Start work on an issue: assigns the viewer, adds it to the project, sets Status to
   * In progress. A successful Orca dispatch calls it too.
   */
  const startWork = useCallback(
    (issue: IssueRef): Promise<boolean> =>
      run({ type: 'start', repo: issue.repo, number: issue.number }, 'start work on'),
    [run],
  );

  const orcaRepo = d ? repoInOrca(orca.data, d.summary.repo) : false;
  const orcaReason = !d || !orca.data || orcaRepo ? undefined : 'repo not in Orca';

  const openDispatch = useCallback(() => {
    if (disabled || !d || d.summary.state === 'closed' || !orca.data?.available || !orcaRepo) return;
    setDispatchError(undefined);
    setDispatchOpen(true);
  }, [disabled, d, orca.data?.available, orcaRepo]);

  const confirmDispatch = useCallback(
    async (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => {
      if (!d) return;
      const { repo, number, id, commentCount } = d.summary;
      setDispatchBusy(true);
      setDispatchError(undefined);
      try {
        const res = await api.orcaDispatch({ repo, number, ...v });
        setDispatchOpen(false);
        setDispatched((m) => new Map(m).set(id, commentCount));
        setPendingDispatch((m) => new Map(m).set(id, { name: res.worktree, at: Date.now() }));
        const started = await startWork({ id, repo, number });
        setToast({
          ok: started,
          message: started
            ? `Dispatched to ${res.worktree}`
            : `Dispatched to ${res.worktree}, but Start work failed. Use S to retry.`,
        });
      } catch (e) {
        setDispatchError(e instanceof Error ? e.message : 'Dispatch failed');
      } finally {
        setDispatchBusy(false);
      }
    },
    [d, startWork],
  );

  const botHeld = d ? hasBotLabel(d.summary.labels, bot()) : false;
  /** The newest check verdict, only while the bot is on: it sets the primary style on the action buttons. */
  const botVerdict = d && bot().enabled ? checkCardOf(d.comments)?.verdict : undefined;

  const openBot = useCallback(() => {
    if (!bot().enabled || disabled || !d || d.summary.state === 'closed' || botHeld) return;
    setBotOpen(true);
  }, [disabled, d, botHeld]);

  const confirmBot = useCallback(async () => {
    if (!d || botBusy) return;
    const { repo, number } = d.summary;
    setBotBusy(true);
    try {
      const res = await write({ type: 'bot', repo, number });
      setBotOpen(false);
      setToast({ ok: true, message: res.message });
      detail.reload();
      p.state.reload();
    } catch (e) {
      const why = e instanceof Error ? e.message : 'Request failed';
      setToast({ ok: false, message: `Could not hand ${repoLabel(repo)} #${number} to ${bot().name}: ${why}` });
    } finally {
      setBotBusy(false);
    }
  }, [d, botBusy, write, detail, p.state]);

  const postBot = useCallback(
    (done: string, failed: string) =>
      async (action: IssueAction): Promise<boolean> => {
        try {
          await write(action);
          setToast({ ok: true, message: done });
          detail.reload();
          return true;
        } catch (e) {
          const why = e instanceof Error ? e.message : 'Request failed';
          setToast({ ok: false, message: `${failed}: ${why}. Nothing changed.` });
          return false;
        }
      },
    [write, detail],
  );
  const postRetry = useMemo(() => postBot(`Asked ${bot().name} to retry`, `Could not ask ${bot().name} to retry`), [postBot]);
  const retry = useBotRetry(d, viewer ?? '', postRetry);
  const requestRetry = useCallback(() => {
    if (!disabled) retry.request();
  }, [disabled, retry]);

  const postSplit = useMemo(() => postBot(`Asked ${bot().name} to split`, `Could not ask ${bot().name} to split`), [postBot]);
  const reloadSubs = useCallback(() => {
    detail.reload();
    p.state.reload();
  }, [detail, p.state]);
  const split = useBotSplit(retry.detail, viewer ?? '', postSplit, reloadSubs);
  const [splitOpen, setSplitOpen] = useState(false);
  const openSplit = useCallback(() => {
    if (!disabled && split.state === 'offered') setSplitOpen(true);
  }, [disabled, split.state]);
  const confirmSplit = useCallback(() => {
    setSplitOpen(false);
    split.request();
  }, [split]);

  const postCheck = useMemo(() => postBot(`Asked ${bot().name} to check`, `Could not ask ${bot().name} to check`), [postBot]);
  const botCheck = useBotCheck(d, viewer ?? '', postCheck);
  const postTrim = useMemo(() => postBot(`Asked ${bot().name} to trim`, `Could not ask ${bot().name} to trim`), [postBot]);
  const botTrim = useBotTrim(d, viewer ?? '', postTrim, reloadSubs);
  const botCheckRequest = useCallback(() => {
    if (!disabled) botCheck.request();
  }, [disabled, botCheck]);

  const stopWork = useCallback(
    (issue: IssueRef): Promise<boolean> =>
      run({ type: 'stop', repo: issue.repo, number: issue.number }, 'stop work on'),
    [run],
  );

  const setStatus = useCallback(
    (status: ProjectStatus) => {
      if (disabled || !effective) return;
      void run({ type: 'status', repo: effective.repo, number: effective.number, status }, 'set status on');
    },
    [disabled, effective, run],
  );

  /** `S` starts work, or stops it when the issue is already In progress. */
  const toggleWork = useCallback(() => {
    if (disabled || !statusOn || !effective || !d) return;
    void (d.summary.status === statusOption('inProgress') ? stopWork(effective) : startWork(effective));
  }, [disabled, statusOn, effective, d, startWork, stopWork]);

  /** `s` opens the Status dropdown, showing the metadata sheet first on narrow layouts. */
  const openStatus = useCallback(() => {
    if (disabled || !statusOn || !d) return;
    const click = () => document.querySelector<HTMLButtonElement>('.status-row .dd-btn')?.click();
    if (layout !== 'three' && !sheet) {
      setSheet(true);
      setTimeout(click, 0);
    } else click();
  }, [disabled, statusOn, d, layout, sheet]);

  const pickerItems = useMemo((): PickerItem[] => {
    const m = meta.data;
    if (!m || !picker) return [];
    if (picker.kind === 'labels') {
      return m.labels.map((l) => ({ value: l.name, text: l.name, node: <LabelChip label={l} /> }));
    }
    if (picker.kind === 'assign') {
      return m.users.map((u) => ({ value: u.login, text: u.login, node: <span>{u.login}</span> }));
    }
    return [
      { value: '', text: 'No milestone', node: <em>No milestone</em> },
      ...m.milestones.map((ms) => ({ value: ms.title, text: ms.title, node: <span>{ms.title}</span> })),
    ];
  }, [meta.data, picker]);

  /** Creates a label in the open picker's repo and hands the picker its row. */
  const createLabel = useCallback(
    async (name: string): Promise<PickerItem> => {
      const res = await write({ type: 'create-label', repo: metaRepo ?? '', name });
      const label = res.label ?? { name, color: 'ededed' };
      return { value: label.name, text: label.name, node: <LabelChip label={label} /> };
    },
    [write, metaRepo],
  );

  const pickerInitial = useMemo((): ReadonlySet<string> => {
    if (!picker) return new Set();
    if (picker.collect) return new Set(picker.current ?? []);
    if (picker.bulk) return new Set();
    if (picker.kind === 'labels') return new Set(d?.summary.labels.map((l) => l.name));
    if (picker.kind === 'assign') return new Set(d?.assignees.map((a) => a.login));
    return new Set(d?.milestone ? [d.milestone] : ['']);
  }, [picker, d]);

  /** Bulk labels and assignees: checked on every selected issue, mixed on some. */
  const pickerOrder = useMemo(() => {
    if (!picker?.bulk || picker.kind === 'milestone') return undefined;
    return bulkPickerOrder(checkedIssues.map((i) => (picker.kind === 'labels' ? i.labels.map((l) => l.name) : i.assignees)));
  }, [picker, checkedIssues]);

  const applyPicker = useCallback(
    (picked: ReadonlySet<string>) => {
      const pk = picker;
      if (!pk) return;
      setPicker(undefined);
      if (pk.collect) {
        pk.collect([...picked]);
        return;
      }
      const add = [...picked].filter((v) => !pickerInitial.has(v));
      const remove = [...pickerInitial].filter((v) => !picked.has(v));
      if (pk.bulk) {
        const targets = checkedIssues.map(refOf);
        const kind = pk.kind === 'labels' ? 'labels' : 'assignees';
        if (add.length === 0) return;
        void bulk(pk.kind === 'labels' ? 'Add labels' : 'Assign', targets, (t) => ({
          type: kind,
          repo: t.repo,
          number: t.number,
          add,
          remove: [],
        }));
        return;
      }
      if (!effective) return;
      const ref = { repo: effective.repo, number: effective.number };
      if (pk.kind === 'milestone') {
        const title = [...picked][0];
        void run({ type: 'milestone', ...ref, milestone: title ? title : null }, 'set milestone on');
      } else if (add.length || remove.length) {
        const type = pk.kind === 'labels' ? 'labels' : 'assignees';
        void run({ type, ...ref, add, remove }, pk.kind === 'labels' ? 'update labels on' : 'update assignees on');
      }
    },
    [picker, pickerInitial, checkedIssues, bulk, effective, run],
  );

  // Close and reopen ---------------------------------------------------------------------

  const startClose = useCallback(
    (reason: CloseReason) => {
      if (disabled) return;
      if (checked.size > 0) {
        setClosing({ targets: checkedIssues.map(refOf), reason });
      } else if (d && d.summary.state === 'open' && effective) {
        setClosing({ targets: [effective], reason });
      }
    },
    [disabled, checked.size, checkedIssues, d, effective],
  );

  const confirmClose = useCallback(
    async (reason: CloseReason, comment: string) => {
      const c = closing;
      if (!c) return;
      if (c.targets.length > 1 || checked.size > 0) {
        setClosing(undefined);
        await bulk('Close', c.targets, (t) => ({ type: 'close', repo: t.repo, number: t.number, reason, comment }));
        return;
      }
      const t = c.targets[0];
      if (!t) return;
      await run({ type: 'close', repo: t.repo, number: t.number, reason, comment }, 'close');
      setClosing(undefined);
    },
    [closing, checked.size, bulk, run],
  );

  const reopen = useCallback(() => {
    if (disabled || !effective || d?.summary.state !== 'closed') return;
    void run({ type: 'reopen', repo: effective.repo, number: effective.number }, 'reopen');
  }, [disabled, effective, d?.summary.state, run]);

  const startNew = useCallback(() => {
    if (disabled) return;
    setNewRepo(effective?.repo ?? everyIssue[0]?.repo ?? '');
    setNewOpen(true);
  }, [disabled, effective?.repo, everyIssue]);

  const repos = useMemo(() => issueRepos(everyIssue), [everyIssue]);
  const labels = useMemo(() => issueLabelNames(everyIssue), [everyIssue]);

  // Fixture captures start in a given UI state.
  useEffect(() => {
    if (initialDone.current || !data || data.issues.length === 0 || !STATE_PARAM?.startsWith('issues-')) return;
    initialDone.current = true;
    if (STATE_PARAM === 'issues-bulk') {
      const ids = FIXTURE_BULK.flatMap((k) => {
        const hit = data.issues.find((i) => `${i.repo}#${i.number}` === k);
        return hit ? [hit.id] : [];
      });
      setChecked(new Set(ids));
    }
    if (STATE_PARAM === 'issues-close' && effective) setClosing({ targets: [effective], reason: 'COMPLETED' });
    if (STATE_PARAM === 'issues-labels') setPicker({ kind: 'labels', bulk: false });
    if (STATE_PARAM === 'issues-new') {
      setNewRepo(effective?.repo ?? '');
      setNewOpen(true);
    }
  }, [data, effective]);

  const subStateDone = useRef(false);
  useEffect(() => {
    if (subStateDone.current || !d || !STATE_PARAM || !SUB_STATES.includes(STATE_PARAM)) return;
    subStateDone.current = true;
    if (STATE_PARAM === 'issues-sub-create') setSubDialog('create');
    if (STATE_PARAM === 'issues-sub-add') setSubDialog('add');
    const third = d.subIssues[2];
    if (STATE_PARAM === 'issues-sub-remove' && third) setRemoving({ child: third, next: d.subIssues[3]?.id });
  }, [d]);

  // Comment navigation: unseen comments first, then all of them.
  const stepComment = useCallback((delta: number) => {
    const box = threadRef.current;
    if (!box) return;
    const all = [...box.querySelectorAll<HTMLElement>('[data-comment]')];
    const unseen = all.filter((el) => el.dataset.unseen === '1');
    const seq = [...unseen, ...all];
    if (seq.length === 0) return;
    cursor.current = (cursor.current + delta + seq.length) % seq.length;
    const target = seq[cursor.current];
    target?.scrollIntoView({ block: 'nearest' });
    // A collapsed hidden comment has no card to land on, so focus its Show comment button.
    target?.querySelector<HTMLElement>('[data-show]')?.focus();
  }, []);

  const clearFilters = useCallback(() => setFilters((f) => ({ ...f, text: '', repo: '', label: '', status: '' })), []);

  const issueOrca = useIssueOrca({
    issue: d ? { id: d.summary.id, number: d.summary.number } : undefined,
    pending: d ? pendingDispatch.get(d.summary.id) : undefined,
    wide: layout === 'three',
    toast: setToast,
  });
  const { onOrcaHints } = p;
  useEffect(() => onOrcaHints?.(p.active ? issueOrca.hints : []), [onOrcaHints, p.active, issueOrca.hints]);

  const modal =
    picker !== undefined ||
    closing !== undefined ||
    newOpen ||
    dispatchOpen ||
    botOpen ||
    splitOpen ||
    subDialog !== undefined ||
    removing !== undefined ||
    outcome !== undefined ||
    issueOrca.modal;

  useIssueHotkeys(
    {
      next: () => move(1),
      prev: () => move(-1),
      open: () => {
        const cur = effective ? find(effective.repo, effective.number) : undefined;
        if (cur) openIssue(cur);
      },
      toggleSelect: () => {
        const cur = effective ? find(effective.repo, effective.number) : undefined;
        if (cur && !isClosedIssue(cur)) toggleCheck(cur);
      },
      comment: () => composerRef.current?.focus(),
      labels: () => openPicker('labels'),
      assign: () => openPicker('assign'),
      assignMe: assignViewer,
      milestone: () => openPicker('milestone'),
      status: openStatus,
      toggleWork,
      dispatch: openDispatch,
      bot: openBot,
      botRetry: requestRetry,
      botSplit: openSplit,
      botCheck: botCheckRequest,
      editTitle: () => !disabled && d && setEditingTitle(true),
      close: () => startClose('COMPLETED'),
      notPlanned: () => startClose('NOT_PLANNED'),
      reopen,
      newIssue: startNew,
      newSubIssue: () => startSub('create'),
      addSubIssue: () => startSub('add'),
      goParent: () => d?.parent && openRelated(d.parent),
      filter:() => filterRef.current?.focus(),
      search: () => p.searchRef.current?.focus(),
      help: p.onHelp,
      escape: () => {
        if (sheet) setSheet(false);
        else if (checked.size > 0) setChecked(new Set());
        else if (filters.text || filters.repo || filters.label || filters.status) clearFilters();
        else if (layout === 'one' && showDetail) setShowDetail(false);
      },
      nextComment: () => stepComment(1),
      prevComment: () => stepComment(-1),
      metadata: () => layout !== 'three' && setSheet((s) => !s),
      more: () => composerRef.current?.closest('.composer')?.querySelector<HTMLButtonElement>('.more-btn')?.click(),
      openGithub: () => d && window.open(d.summary.url, '_blank', 'noopener,noreferrer'),
      refresh: p.onRefresh,
      closedWindow: closed.cycle,
      goPrs: p.onGoPrs,
      pair: p.onPair,
      orcaOpen: issueOrca.openInOrca,
      orcaSend: issueOrca.openSend,
    },
    p.active && !modal,
  );

  const openLinkedPr = (repo: string, number: number) => p.onOpenPr(repo, number);
  const cards = d ? (
    <MetadataCards
      detail={d}
      disabled={disabled}
      onUnassign={(login) =>
        effective && void run({ type: 'assignees', repo: effective.repo, number: effective.number, add: [], remove: [login] }, 'unassign')
      }
      onLabels={() => openPicker('labels')}
      onAssign={() => openPicker('assign')}
      onAssignMe={assignViewer}
      viewer={viewer}
      onMilestone={() => openPicker('milestone')}
      onOpenPr={openLinkedPr}
      onOpenGithub={() => window.open(d.summary.url, '_blank', 'noopener,noreferrer')}
      flat={layout === 'three'}
      status={{
        enabled: statusOn,
        onSet: setStatus,
        onStart: () => effective && void startWork(effective),
        onStop: () => effective && void stopWork(effective),
      }}
    />
  ) : null;

  const listPane = (
    <IssueListPane
      state={p.state}
      sections={sections}
      selectedId={effective?.id}
      checked={checked}
      dispatched={dispatched}
      filters={filters}
      repos={repos}
      labels={labels}
      filterRef={filterRef}
      listRef={listRef}
      narrow={layout !== 'three'}
      onFilters={setFilters}
      onToggle={toggleSection}
      onSelect={select}
      onOpen={openIssue}
      onCheck={toggleCheck}
      onBulk={(k) => (k === 'close' ? startClose('COMPLETED') : k === 'assignMe' ? assignViewer() : openPicker(k))}
      onClear={() => setChecked(new Set())}
      onRetry={p.onRefresh}
      onNew={startNew}
      closed={
        <ClosedSection
          state={closed.state}
          items={closedRows}
          narrow={layout !== 'three'}
          renderRow={(i) => (
            <ClosedRow
              key={i.id}
              id={i.id}
              repo={i.repo}
              number={i.number}
              title={i.title}
              author={i.author}
              closedAt={i.closedAt}
              url={i.url}
              state={closedIssueState(i)}
              selected={i.id === effective?.id}
              onSelect={() => select(i)}
              onOpen={() => openIssue(i)}
            />
          )}
          onToggle={closed.toggle}
          onWindow={closed.setWindow}
          onMore={closed.more}
          onRetry={closed.retry}
        />
      }
    />
  );

  const detailPane = (
    <IssueDetailPane
      detail={split.detail}
      retry={retry.state}
      onRetry={requestRetry}
      split={split.state}
      onSplit={openSplit}
      error={detail.error}
      selectedLabel={effective ? `${repoLabel(effective.repo)} #${effective.number}` : undefined}
      selectedItem={effective ? known.find((i) => i.id === effective.id) : undefined}
      compact={layout !== 'three'}
      disabled={disabled}
      unseenFrom={unseenFrom}
      editingTitle={editingTitle}
      threadRef={threadRef}
      composerRef={composerRef}
      showBack={layout === 'one'}
      onBack={() => setShowDetail(false)}
      onPrevComment={() => stepComment(-1)}
      onNextComment={() => stepComment(1)}
      onEditTitle={() => !disabled && setEditingTitle(true)}
      onSaveTitle={(title) => {
        setEditingTitle(false);
        if (effective) void run({ type: 'title', repo: effective.repo, number: effective.number, title }, 'rename');
      }}
      onCancelTitle={() => setEditingTitle(false)}
      onComment={(body) =>
        effective ? run({ type: 'comment', repo: effective.repo, number: effective.number, body }, 'comment on') : Promise.resolve(false)
      }
      onUploadError={(message) => setToast({ ok: false, message })}
      onClose={startClose}
      onReopen={reopen}
      onLabels={() => openPicker('labels')}
      onAssign={() => openPicker('assign')}
      onMilestone={() => openPicker('milestone')}
      onNew={startNew}
      onMetadata={() => setSheet(true)}
      orcaStrip={issueOrca.strip}
      subIssues={subCard}
      onParent={() => d?.parent && openRelated(d.parent)}
      botStrip={
        d && layout !== 'three' ? (
          <BotCheckStrip detail={d} disabled={disabled} check={botCheck} trim={botTrim} issue={d.summary.id} />
        ) : undefined
      }
    />
  );

  return (
    <>
      <main
        className="panes issues-panes"
        data-view={showDetail ? 'detail' : 'list'}
        ref={panesRef}
        style={layout === 'one' ? undefined : { gridTemplateColumns: pw.columns }}
      >
        {listPane}
        {layout !== 'one' ? handle(0, 'Resize Issues') : null}
        {layout === 'three' ? (
          <>
            {detailPane}
            {handle(1, 'Resize Detail')}
            <aside className="pane isidebar" aria-label="Metadata and actions">
              <div className="pane-h pane-h-bare">METADATA + ACTIONS</div>
              <div className="scroll isidebar-scroll">
                {cards}
                {d ? <BotCheckCard detail={d} disabled={disabled} check={botCheck} trim={botTrim} /> : null}
              </div>
              <ActionsPanel
                disabled={disabled || !d}
                closed={d?.summary.state === 'closed'}
                onComment={() => composerRef.current?.focus()}
                onEditTitle={() => setEditingTitle(true)}
                onClose={startClose}
                onReopen={reopen}
                onNew={startNew}
                emphasis={emphasisFor(botVerdict)}
                dispatch={
                  !orca.data || orca.data.available
                    ? {
                        reason: orcaReason,
                        pending: !orca.data,
                        ...(issueOrca.live && d ? { live: d.summary.number } : {}),
                        onClick: openDispatch,
                      }
                    : undefined
                }
                bot={{ held: botHeld, onClick: openBot }}
              />
            </aside>
          </>
        ) : (
          <div className="detail-wrap">
            {detailPane}
            {sheet && cards ? (
              <aside className="msheet" aria-label="Metadata">
                <div className="pane-h">
                  <span>METADATA</span>
                  <button type="button" className="btn icon-btn" onClick={() => setSheet(false)}>
                    Close <span className="kbd">Esc</span>
                  </button>
                </div>
                <div className="scroll msheet-scroll">{cards}</div>
              </aside>
            ) : null}
          </div>
        )}
      </main>
      {picker ? (
        <Picker
          title={
            picker.kind === 'labels'
              ? `Labels for ${picker.bulk ? `${checked.size} issues` : (metaRepo ?? '')}`
              : picker.kind === 'assign'
                ? 'Assignees'
                : 'Milestone'
          }
          filterPlaceholder={picker.kind === 'labels' ? 'Filter labels' : picker.kind === 'assign' ? 'Filter people' : 'Filter milestones'}
          items={pickerItems}
          initial={pickerInitial}
          ranked={pickerOrder}
          single={picker.kind === 'milestone'}
          loading={meta.loading && !meta.data}
          error={meta.error}
          note={picker.bulk ? 'In bulk mode the picker adds to all selected issues.' : undefined}
          anchor={layout === 'three' ? 'sidebar' : 'center'}
          create={picker.kind === 'labels' && !picker.bulk && metaRepo ? createLabel : undefined}
          onApply={applyPicker}
          onCancel={() => setPicker(undefined)}
        />
      ) : null}
      {closing ? (
        <CloseDialog
          targets={closing.targets.map((t) => {
            const hit = find(t.repo, t.number);
            return { repo: t.repo, number: t.number, title: hit?.title ?? d?.summary.title ?? '' };
          })}
          linkedPr={
            closing.targets.length === 1 && d?.linkedPrs[0]
              ? `${d.linkedPrs[0].repo} #${d.linkedPrs[0].number}`
              : undefined
          }
          initial={closing.reason}
          busy={busy}
          onConfirm={(r, c) => void confirmClose(r, c)}
          onCancel={() => setClosing(undefined)}
        />
      ) : null}
      {newOpen ? (
        <NewIssueDialog
          repos={repos}
          initialRepo={newRepo}
          meta={meta.data}
          busy={busy}
          onRepo={setNewRepo}
          onPickLabels={(current, set) => setPicker({ kind: 'labels', bulk: false, current, collect: set })}
          onPickAssignees={(current, set) => setPicker({ kind: 'assign', bulk: false, current, collect: set })}
          onCreate={async (v) => {
            const ok = await run({ type: 'create', ...v }, 'create issue in');
            if (ok) setNewOpen(false);
          }}
          onCancel={() => setNewOpen(false)}
        />
      ) : null}
      {dispatchOpen && d ? (
        <DispatchDialog
          issue={d.summary}
          agents={orca.data?.agents ?? []}
          busy={dispatchBusy}
          error={dispatchError}
          onConfirm={(v) => void confirmDispatch(v)}
          onCancel={() => setDispatchOpen(false)}
        />
      ) : null}
      {splitOpen && d && split.state === 'offered' ? (
        <SplitDialog issue={d.summary} parts={split.parts} onConfirm={confirmSplit} onCancel={() => setSplitOpen(false)} />
      ) : null}
      {botOpen && d ? (
        <BotDialog
          issue={d.summary}
          busy={botBusy}
          onConfirm={() => void confirmBot()}
          onCancel={() => setBotOpen(false)}
        />
      ) : null}
      {subDialog === 'create' && d ? (
        <CreateSubIssueDialog
          parent={d.summary}
          repos={repos}
          onCreate={async (repo, title, body) => {
            const res = await subs.create(repo, title, body);
            setToast({ ok: true, message: res.message });
          }}
          onCancel={() => setSubDialog(undefined)}
        />
      ) : null}
      {subDialog === 'add' && d ? (
        <AddExistingPicker
          parent={d.summary}
          issues={everyIssue}
          repos={repos}
          used={subs.rows.length}
          onAdd={(c) => {
            setSubDialog(undefined);
            void subs.add(c);
          }}
          onCancel={() => setSubDialog(undefined)}
        />
      ) : null}
      {removing && d ? (
        <RemoveSubIssueDialog
          parent={d.summary}
          child={removing.child}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(undefined)}
        />
      ) : null}
      {issueOrca.overlays}
      {outcome ? (
        <BulkReport
          title={outcome.title}
          total={outcome.total}
          failures={outcome.failures}
          onRetry={outcome.retry}
          onDismiss={() => setOutcome(undefined)}
        />
      ) : null}
      {toast ? (
        <div className={`toast${toast.ok ? '' : ' toast-error toast-action'}`} role="status">
          <span>{toast.message}</span>
          {toast.retry ? (
            <>
              <button type="button" className="btn" onClick={toast.retry}>
                Retry
              </button>
              <button type="button" className="btn" onClick={() => setToast(undefined)}>
                Dismiss
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
