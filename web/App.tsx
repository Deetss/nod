import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  mergeMethodLabel,
  type DiffMode,
  type FileItem,
  type PrSummary,
  type SectionKey,
} from '../shared/types';
import { ActionDialog, HelpSheet } from './Dialogs';
import { screenPeople } from './mentions/mention-logic';
import { PairDialog } from './PairDialog';
import { ACTIVITY_HELP_KEYS, issueHelpKeys, type KeyDef } from './keys';
import { bot, isFirstRun, loadedSettings } from './org-settings';
import { SettingsDialog } from './settings/SettingsDialog';
import { useSettingsKey } from './settings/useSettingsKey';
import { Welcome } from './settings/Welcome';
import { ActivityView } from './ActivityView';
import { activityBadge } from '../shared/activity';
import { DetailBody, type ActionKind } from './DetailBody';
import { PrHeader, PrLoadingHeader, ReviewBar } from './DetailPane';
import { DiffList, DiffToolbar, type ScrollRequest } from './DiffPane';
import { groupThreads } from './inline/group-threads';
import type { FileHead } from './file-actions';
import { loadWrap, saveWrap } from './diff-view';
import { loadHideViewed, saveHideViewed, treeOrder } from './tree-state';
import { Footer } from './Footer';
import { DensityContext, useAltHeld, useDensity } from './density';
import { FollowContext } from './follow';
import { FollowStatus } from './FollowStatus';
import { ToastStack, useToasts } from './toasts';
import { OrcaSessionsContext } from './orca/OrcaContext';
import { useOrca } from './orca/useOrca';
import { PaneHandle } from './PaneHandle';
import { InboxPane } from './InboxPane';
import { ClosedRow, ClosedSection } from './ClosedSection';
import { captureSelectsClosed, useClosed } from './useClosed';
import { closedPrState, isClosedPr, type ClosedPr } from '../shared/closed';
import { IssuesView, type IssueTarget } from './issues/IssuesView';
import { useIssues } from './issues/useIssues';
import { initialView, saveView, scrollRowIntoView, type ListView } from './list-view';
import { ReviewPane } from './ReviewPane';
import { Topbar, type SearchItem } from './Topbar';
import { STATE_PARAM, api } from './api';
import { useHotkeys, useLayout, useTheme } from './hooks';
import { isLive } from './ci';
import { LinkRouterContext, isKnownRepo, openExternal, resolveItemLink, type ItemLink } from './links';

const CHECKS_POLL_MS = 5000;
import { DEFAULT_COLLAPSED, allPrs, filterPrs, visibleSections, walkOrder } from './inbox-utils';
import type { NotifyTarget } from '../shared/notify-rules';
import { NO_ACCESS, reviewAccess } from '../shared/pr-actions';
import { useInbox } from './useInbox';
import { setKnownRepos } from './repo-label';
import { parseOpenParam, reloadUrl, type OpenRef } from '../shared/build-update';
import { UpdateToast, useBuildUpdates } from './UpdateNotice';
import { PhoneApp } from './phone/PhoneApp';
import type { SheetTarget } from './phone/PhoneSheet';
import type { PhoneTab } from './phone/phone-logic';
import { usePhone } from './phone/usePhone';
import { useActivity } from './useActivity';
import { useNotifications, useNotifySettings } from './useNotifications';
import { usePaneWidths } from './usePaneWidths';
import { useRemote } from './useRemote';
import {
  ViewedWriter,
  applyOverride,
  reconcileOverrides,
  revertOverride,
  setOverride,
  settleOverride,
  viewedKey,
  type ViewedOverrides,
} from './viewed-sync';
import { useSeenOnView } from './useSeenOnView';
import { FixDialogs } from './FixDialogs';
import { ALL_FAILING, useFixChecks, useResolveConflicts } from './useFixChecks';
import { useFixComments } from './useFixComments';
import { EmptyPane } from './Logo';

interface QueuedView {
  prId: string;
  path: string;
  viewed: boolean;
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [density, setDensity] = useDensity();
  useAltHeld();
  const [listView, setListView] = useState<ListView>(() => initialView(window.location.search));
  const layout = useLayout(listView === 'issues' ? 1100 : 1400);
  const narrow = layout !== 'three';
  const phone = usePhone();
  const [phoneActivity, setPhoneActivity] = useState(false);
  const [phoneSheet, setPhoneSheet] = useState<SheetTarget>();

  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionKey>>(new Set(DEFAULT_COLLAPSED));
  const [selectedId, setSelectedId] = useState<string>();
  const [issueSeen, setIssueSeen] = useState<ReadonlySet<string>>(new Set());
  const [issueTarget, setIssueTarget] = useState<IssueTarget>();
  const [seenLocal, setSeenLocal] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<DiffMode>(STATE_PARAM === 'interdiff' ? 'since' : 'all');
  const [view, setView] = useState<'inbox' | 'review'>('inbox');
  const [drawer, setDrawer] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [orcaHints, setOrcaHints] = useState<KeyDef[]>([]);
  const [footerKeys, setFooterKeys] = useState<KeyDef[]>();
  const [pairing, setPairing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(isFirstRun);
  const settingsShown = settingsOpen || welcomeOpen;
  const [action, setAction] = useState<ActionKind>();
  const [busy, setBusy] = useState(false);
  const toasts = useToasts();
  const pushToast = toasts.push;
  /** The action's own result. Orca notifications stack above it. */
  const setToast = useCallback(
    (t: { ok: boolean; message: string }) => pushToast({ kind: t.ok ? 'ok' : 'err', message: t.message, ms: 5000 }),
    [pushToast],
  );
  const [currentPath, setCurrentPath] = useState<string>();
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest>();
  const [wrap, setWrap] = useState<boolean>(loadWrap);
  const [hideViewed, setHideViewed] = useState<boolean>(loadHideViewed);
  const [viewedOv, setViewedOv] = useState<ViewedOverrides>({});
  const queue = useRef<Map<string, QueuedView>>(new Map());
  const viewedWriter = useRef<ViewedWriter>(undefined);
  viewedWriter.current ??= new ViewedWriter({
    send: api.setViewed,
    onSettled: (key, viewed) => setViewedOv((o) => settleOverride(o, key, viewed, Date.now())),
    onFailed: (key, viewed, message) => {
      setViewedOv((o) => revertOverride(o, key, viewed));
      setToast({ ok: false, message: `Could not save viewed state: ${message}` });
    },
  });
  const scrollN = useRef(0);

  const filterRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const diffRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLElement>(null);

  const pw = usePaneWidths(layout === 'three' ? 'three' : 'two', panesRef);
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

  const inbox = useInbox();
  const closed = useClosed<ClosedPr>(api.closedPrs);
  const firstClosedId = closed.state.items[0]?.id;
  useEffect(() => {
    if (captureSelectsClosed() && firstClosedId) setSelectedId((id) => id ?? firstClosedId);
  }, [firstClosedId]);
  // Issues ride on the PR poll: each sync updates the server's saved issue list, and this reads it.
  const issues = useIssues(inbox.data?.syncedAt);
  const activity = useActivity(inbox.data?.syncedAt, listView === 'activity' || (phone && phoneActivity));
  const issueUnseen = (issues.data?.issues ?? []).filter((i) => i.seen !== 'seen' && !issueSeen.has(i.id)).length;
  const prUnseen = inbox.data ? allPrs(inbox.data).filter((p) => p.seen !== 'seen' && !seenLocal.has(p.id)).length : 0;
  const activityUnseen = activity.feed ? activityBadge(activity.feed, activity.lastVisit) : 0;
  const switchView = useCallback((v: ListView) => {
    setListView(v);
    saveView(v);
  }, []);
  const goPrs = useCallback(() => switchView('prs'), [switchView]);
  const goIssues = useCallback(() => switchView('issues'), [switchView]);
  const goActivity = useCallback(() => switchView('activity'), [switchView]);
  /** The issue last shown in the desktop Issues view, kept across an update reload. */
  const shownIssue = useRef<string>(undefined);
  const markIssueSeen = useCallback((id: string) => {
    shownIssue.current = id;
    setIssueSeen((s) => new Set(s).add(id));
  }, []);
  const showIssue = useCallback(
    (repo: string, number: number) => {
      switchView('issues');
      setIssueTarget((t) => ({ repo, number, n: (t?.n ?? 0) + 1 }));
    },
    [switchView],
  );

  const sections = useMemo(() => {
    const base = visibleSections(inbox.data, filter, collapsed);
    return base.map((s) => ({
      ...s,
      prs: s.prs.map((p) =>
        seenLocal.has(p.id) ? { ...p, seen: 'seen' as const, updatedNote: undefined } : p,
      ),
    }));
  }, [inbox.data, filter, collapsed, seenLocal]);

  // j and k walk the open rows, then the closed rows once that section is open.
  const closedRows = useMemo(
    () => (closed.state.open ? filterPrs(closed.state.items, filter) : []),
    [closed.state.open, closed.state.items, filter],
  );
  const order = useMemo(() => [...walkOrder(sections), ...closedRows], [sections, closedRows]);
  const everyPr = useMemo(() => allPrs(inbox.data), [inbox.data]);
  setKnownRepos([
    ...everyPr.map((p) => p.repo),
    ...closed.state.items.map((p) => p.repo),
    ...(issues.data?.issues ?? []).map((i) => i.repo),
  ]);
  const prById = useMemo(() => new Map(everyPr.map((p) => [p.id, p])), [everyPr]);
  const effectiveId = selectedId ?? order[0]?.id;
  const selected: PrSummary | undefined =
    everyPr.find((p) => p.id === effectiveId) ?? closed.state.items.find((p) => p.id === effectiveId);

  const detail = useRemote(selected ? `detail:${selected.id}` : null, () =>
    api.detail(selected?.repo ?? '', selected?.number ?? 0),
  );
  const diff = useRemote(selected ? `diff:${selected.id}:${mode}` : null, () =>
    api.diff(selected?.repo ?? '', selected?.number ?? 0, mode),
  );

  const limited =
    inbox.data?.stale?.kind === 'ratelimit' ||
    detail.data?.stale?.kind === 'ratelimit' ||
    inbox.data?.rate?.remaining === 0;

  const reloadAll = useCallback(() => {
    inbox.reload();
    detail.reload();
    diff.reload();
  }, [inbox, detail, diff]);

  // A poll that moves the open PR's head or updatedAt reloads its detail and diff.
  // The server answers from its cache unless the PR really changed.
  const version = useRef<string | undefined>(undefined);
  useEffect(() => {
    const next = selected ? `${selected.id}|${selected.headSha}|${selected.updatedAt}` : undefined;
    const prev = version.current;
    version.current = next;
    if (prev && next && prev.split('|')[0] === next.split('|')[0] && prev !== next) {
      detail.reload();
      diff.reload();
    }
  }, [selected?.id, selected?.headSha, selected?.updatedAt]);

  // While the open PR has checks in flight, re-fetch its detail every few seconds so
  // state changes show up. The server answers from its cache unless the PR changed.
  const checksLive = detail.data?.checks.some(isLive) ?? false;
  useEffect(() => {
    if (!checksLive) return;
    const t = setInterval(detail.reload, CHECKS_POLL_MS);
    return () => clearInterval(t);
  }, [checksLive, detail.reload]);

  // The file menu needs the head and base branches, so it waits for this PR's detail.
  const fileHead = useMemo<FileHead | undefined>(() => {
    const d = detail.data;
    if (!d || !selected || d.summary.id !== selected.id) return undefined;
    return {
      prUrl: selected.url,
      headRef: d.headRef,
      baseRef: d.baseRef,
      state: d.isOpen === false ? (d.merged ? 'merged' : 'closed') : 'open',
      fork: d.headIsFork === true,
    };
  }, [detail.data, selected]);

  const refresh = useCallback(() => {
    if (limited) return;
    inbox.reload(true);
    detail.reload();
    diff.reload();
  }, [limited, inbox, detail, diff]);

  // Keyboard focus starts on the inbox list.
  const focused = useRef(false);
  useEffect(() => {
    if (inbox.data && !focused.current) {
      focused.current = true;
      listRef.current?.focus({ preventScroll: true });
    }
  }, [inbox.data]);

  // A detail load retires only the marks the server data has caught up with.
  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    const server = (key: string) => {
      const i = key.indexOf(':');
      if (key.slice(0, i) !== d.summary.id) return undefined;
      return d.files.find((f) => f.path === key.slice(i + 1))?.viewed;
    };
    setViewedOv((o) => reconcileOverrides(o, server, Date.now()));
  }, [detail.data]);

  const files: FileItem[] = useMemo(() => {
    const all = (detail.data?.files ?? []).map((f) => ({
      ...f,
      viewed: applyOverride(viewedOv, viewedKey(selected?.id ?? '', f.path), f.viewed),
    }));
    return treeOrder(mode === 'since' ? all.filter((f) => f.changedSinceReview) : all);
  }, [detail.data, viewedOv, mode, selected?.id]);

  const scrollToFile = useCallback((path: string) => {
    setCurrentPath(path);
    setScrollRequest({ path, n: ++scrollN.current });
  }, []);

  const stepFile = useCallback(
    (delta: number) => {
      const i = files.findIndex((f) => f.path === currentPath);
      const next = files[Math.min(files.length - 1, Math.max(0, i + delta))];
      if (next) scrollToFile(next.path);
    },
    [files, currentPath, scrollToFile],
  );

  const flushQueue = useCallback(() => {
    const pending = [...queue.current.values()];
    queue.current.clear();
    for (const q of pending) viewedWriter.current?.write(q.prId, q.path, q.viewed);
  }, []);

  useEffect(() => {
    if (inbox.data && !inbox.data.stale && queue.current.size > 0) flushQueue();
  }, [inbox.data, flushQueue]);

  const toggleViewed = useCallback(
    (path: string, viewed: boolean) => {
      if (!selected) return;
      const key = viewedKey(selected.id, path);
      setViewedOv((o) => setOverride(o, key, viewed));
      if (viewed) {
        const after = files.slice(files.findIndex((f) => f.path === path) + 1);
        const next = [...after, ...files].find((f) => !f.viewed && f.path !== path);
        if (next) scrollToFile(next.path);
      }
      if (limited) queue.current.set(key, { prId: selected.id, path, viewed });
      else viewedWriter.current?.write(selected.id, path, viewed);
    },
    [selected, files, limited, scrollToFile],
  );

  const select = useCallback((pr: PrSummary) => setSelectedId(pr.id), []);

  const markSeen = useCallback((pr: PrSummary) => {
    setSeenLocal((s) => new Set(s).add(pr.id));
    void api.seen(pr).catch(() => undefined);
  }, []);
  // The desktop detail pane shows the selection. In the one-pane layout that is the review view.
  const detailShown = !phone && listView === 'prs' && (layout !== 'one' || view === 'review');
  // A closed PR is read-only, so looking at it records nothing.
  useSeenOnView(detailShown && selected && !isClosedPr(selected) ? selected : undefined, markSeen);

  const openPr = useCallback(
    (pr: PrSummary) => {
      setSelectedId(pr.id);
      if (!isClosedPr(pr)) {
        setSeenLocal((s) => new Set(s).add(pr.id));
        void api.seen(pr).catch(() => undefined);
      }
      if (layout === 'one') setView('review');
      setTimeout(() => diffRef.current?.focus({ preventScroll: true }), 0);
    },
    [layout],
  );

  const move = useCallback(
    (delta: number) => {
      if (order.length === 0) return;
      const i = order.findIndex((p) => p.id === effectiveId);
      const next = order[Math.min(order.length - 1, Math.max(0, i + delta))];
      if (!next) return;
      setSelectedId(next.id);
      scrollRowIntoView(next.id);
    },
    [order, effectiveId],
  );

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const showOrg = useCallback(() => {
    setCollapsed((c) => {
      const n = new Set(c);
      n.delete('org');
      return n;
    });
  }, []);

  const viewer = inbox.data?.viewer ?? '';
  const access = useMemo(
    () =>
      detail.data
        ? reviewAccess({
            author: detail.data.summary.author,
            viewer,
            viewerCanMergeAsAdmin: detail.data.viewerCanMergeAsAdmin,
            headCommitLogins: detail.data.headCommitLogins,
            ci: detail.data.summary.ci,
            isDraft: detail.data.summary.isDraft,
          })
        : NO_ACCESS,
    [detail.data, viewer],
  );

  const startAction = useCallback(
    (kind: ActionKind) => {
      if (!selected || !detail.data || limited) return;
      if (access.ownPr && (kind === 'approve' || kind === 'request')) return;
      if (kind === 'admin' && access.admin !== 'ready') return;
      if (kind === 'ready' && !access.draft) return;
      if (kind === 'merge' && (access.draft || detail.data.summary.autoMerge)) return;
      setAction(kind);
    },
    [selected, detail.data, limited, access],
  );

  /** Set once `useOrca` runs, which needs the detail and the Orca info loaded below. */
  const noticeRef = useRef<(res: { noticeId?: string }, forPr: boolean) => void>(undefined);
  const runAction = useCallback(
    async (body: string) => {
      if (!selected || !action) return;
      setBusy(true);
      try {
        const res =
          action === 'merge'
            ? await api.merge(selected.repo, selected.number)
            : action === 'admin'
              ? await api.adminMerge(selected.repo, selected.number, Number(body))
              : action === 'ready'
                ? await api.markReady(selected.repo, selected.number)
                : await api.review(
                    selected.repo,
                    selected.number,
                    action === 'approve' ? 'APPROVE' : action === 'request' ? 'REQUEST_CHANGES' : 'COMMENT',
                    body,
                  );
        setToast({ ok: res.ok, message: res.message });
        noticeRef.current?.(res, true);
        if (res.ok) reloadAll();
      } catch (e) {
        setToast({ ok: false, message: e instanceof Error ? e.message : 'Action failed' });
      } finally {
        setBusy(false);
        setAction(undefined);
      }
    },
    [selected, action, reloadAll],
  );

  const toggleMode = useCallback(() => setMode((m) => (m === 'all' ? 'since' : 'all')), []);
  const toggleWrap = useCallback(() => setWrap((w) => !w), []);
  const toggleHideViewed = useCallback(() => setHideViewed((h) => !h), []);

  useEffect(() => saveWrap(wrap), [wrap]);
  useEffect(() => saveHideViewed(hideViewed), [hideViewed]);

  const orca = useRemote('orca', () => api.orca());
  const { controls: fix, dialogs: fixDialogs } = useFixChecks({
    detail: detail.data,
    limited,
    orca: orca.data,
    notify: (ok, message) => setToast({ ok, message }),
    onDone: reloadAll,
  });
  const resolve = useResolveConflicts({
    detail: detail.data,
    limited,
    orca: orca.data,
    notify: (ok, message) => setToast({ ok, message }),
  });
  const comments = useFixComments({
    detail: detail.data,
    limited,
    orca: orca.data,
    notify: (ok, message) => setToast({ ok, message }),
    onDone: reloadAll,
  });
  const fixOpen =
    fix?.menu !== undefined ||
    fixDialogs?.dialog !== undefined ||
    resolve?.menu !== undefined ||
    comments?.menu !== undefined;
  const repoNames = useMemo(() => [...new Set(everyPr.map((p) => p.repo))].sort((a, b) => a.localeCompare(b)), [everyPr]);
  const orcaUi = useOrca({
    detail: detail.data,
    orca: orca.data,
    active: !phone,
    syncedAt: inbox.data?.syncedAt,
    repoNames,
    toast: pushToast,
    onDetails: goActivity,
  });
  noticeRef.current = orcaUi.handleNotice;

  useHotkeys(
    {
      fix: () => fix?.openMenu(ALL_FAILING),
      sendOrca: orcaUi.keys.send,
      openOrca: orcaUi.keys.open,
      next: () => move(1),
      prev: () => move(-1),
      open: () => selected && openPr(selected),
      nextFile: () => stepFile(1),
      prevFile: () => stepFile(-1),
      viewed: () => {
        const f = files.find((x) => x.path === currentPath);
        if (f) void toggleViewed(f.path, !f.viewed);
      },
      interdiff: toggleMode,
      wrap: toggleWrap,
      hideViewed: toggleHideViewed,
      approve: () => startAction('approve'),
      request: () => startAction('request'),
      comment: () => startAction('comment'),
      merge: () => startAction('merge'),
      adminMerge: () => startAction('admin'),
      ready: () => startAction('ready'),
      openGithub: () => selected && openExternal(selected.url),
      filter: () => filterRef.current?.focus(),
      search: () => searchRef.current?.focus(),
      help: () => setHelp(true),
      pair: () => setPairing(true),
      escape: () => {
        if (drawer) setDrawer(false);
        else if (layout === 'one' && view === 'review') setView('inbox');
      },
      details: () => narrow && setDrawer((d) => !d),
      expand: () => setDescOpen((d) => !d),
      refresh,
      showOrg,
      closedWindow: closed.cycle,
      goPrs,
      goIssues,
      goActivity,
    },
    !action && !help && !pairing && !settingsShown && !fixOpen && !orcaUi.modalOpen && listView === 'prs',
  );
  useSettingsKey(!phone, () => setSettingsOpen(true));

  const d = detail.data;
  const pickFromSearch = useCallback(
    (pr: PrSummary) => {
      showOrg();
      setFilter('');
      openPr(pr);
      scrollRowIntoView(pr.id);
    },
    [openPr, showOrg],
  );

  const [notifySettings, setNotifySettings] = useNotifySettings();
  const openTarget = useCallback(
    (t: NotifyTarget) => {
      if (t.kind === 'issue') {
        showIssue(t.repo, t.number);
        return true;
      }
      const pr = everyPr.find((p) => p.repo === t.repo && p.number === t.number);
      if (!pr) return false;
      switchView('prs');
      pickFromSearch(pr);
      return true;
    },
    [everyPr, pickFromSearch, showIssue, switchView],
  );
  const routeLink = useCallback(
    (l: ItemLink) => {
      const urls = [...(issues.data?.issues ?? []), ...everyPr].map((x) => x.url);
      if (!isKnownRepo(l, urls)) return false;
      if (l.kind === 'pr' && !resolveItemLink(l, everyPr)) return false;
      return openTarget(l);
    },
    [issues.data, everyPr, openTarget],
  );
  const notifySeen = useMemo(() => new Set([...seenLocal, ...issueSeen]), [seenLocal, issueSeen]);
  useNotifications({
    data: inbox.data,
    issues: issues.data,
    ready: inbox.ready,
    settings: notifySettings,
    seenIds: notifySeen,
    onOpen: openTarget,
  });

  // An update reload comes back as `/?open=<kind>/<owner>/<name>/<number>`. The phone reads it itself.
  const reopened = useRef(false);
  useEffect(() => {
    if (phone || reopened.current || !inbox.data || !issues.data) return;
    reopened.current = true;
    const ref = parseOpenParam(new URLSearchParams(window.location.search).get('open'));
    if (!ref) return;
    openTarget(ref);
    window.history.replaceState(window.history.state, '', reloadUrl(window.location, undefined));
  }, [phone, inbox.data, issues.data, openTarget]);

  const currentOpen = (): OpenRef | undefined => {
    if (phone) {
      const t = phoneSheet;
      const item =
        t?.kind === 'pr' ? everyPr.find((x) => x.id === t.id) : issues.data?.issues.find((x) => x.id === t?.id);
      return t && item ? { kind: t.kind, repo: item.repo, number: item.number } : undefined;
    }
    if (listView === 'prs' && selectedId) {
      const pr = prById.get(selectedId);
      return pr ? { kind: 'pr', repo: pr.repo, number: pr.number } : undefined;
    }
    const issue = listView === 'issues' ? issues.data?.issues.find((x) => x.id === shownIssue.current) : undefined;
    return issue ? { kind: 'issue', repo: issue.repo, number: issue.number } : undefined;
  };
  const updates = useBuildUpdates(currentOpen);
  const updateToast = <UpdateToast notice={updates.notice} phone={phone} onReload={updates.reloadNow} />;

  const searchItems = useMemo(
    (): SearchItem[] => [
      ...everyPr.map((p) => ({ id: p.id, kind: 'pr' as const, repo: p.repo, number: p.number, title: p.title, extra: p.author })),
      ...(issues.data?.issues ?? []).map((i) => ({
        id: i.id,
        kind: 'issue' as const,
        repo: i.repo,
        number: i.number,
        title: i.title,
        extra: i.author,
      })),
    ],
    [issues.data, everyPr],
  );

  // An unlisted issue opens in the Issues view; an unlisted PR opens on GitHub.
  const pickSearch = useCallback(
    (item: SearchItem) => {
      if (item.kind === 'issue') {
        showIssue(item.repo, item.number);
        return;
      }
      const pr = everyPr.find((p) => p.repo === item.repo && p.number === item.number);
      if (pr) {
        switchView('prs');
        pickFromSearch(pr);
      } else if (item.url) openExternal(item.url);
    },
    [everyPr, pickFromSearch, showIssue, switchView],
  );

  const openPrFromIssue = useCallback(
    (repo: string, number: number) => {
      const pr = everyPr.find((p) => p.repo === repo && p.number === number);
      switchView('prs');
      if (pr) pickFromSearch(pr);
    },
    [everyPr, pickFromSearch, switchView],
  );

  const bodyProps = d && {
    detail: d,
    files,
    mode,
    range: diff.data?.range ?? '',
    commitsInRange: diff.data?.commitsInRange ?? 0,
    currentPath,
    scrollRequest,
    actionsDisabled: limited,
    access,
    hideViewed,
    onToggleHideViewed: toggleHideViewed,
    descOpen,
    onToggleDesc: () => setDescOpen((o) => !o),
    onToggleViewed: (p: string, v: boolean) => void toggleViewed(p, v),
    onOpenFile: (p: string) => {
      scrollToFile(p);
      setDrawer(false);
    },
    onAction: startAction,
    fix,
    resolve,
    comments,
    orca: orcaUi.section,
  };

  const viewedCount = files.filter((f) => f.viewed).length;
  const toolbar = (
    <DiffToolbar
      mode={mode}
      narrow={narrow}
      range={diff.data?.range ?? ''}
      viewed={viewedCount}
      total={files.length}
      wrap={wrap}
      onWrap={toggleWrap}
      onMode={setMode}
      onPrev={() => stepFile(-1)}
      onNext={() => stepFile(1)}
      onFiles={() => setDrawer(true)}
    />
  );
  const dialogPr = selected && d ? selected : undefined;
  // The PR's threads and the viewer's drafts, grouped by file for the diff.
  const threadFiles = useMemo(() => groupThreads(d?.thread), [d?.thread]);
  // People on the PR for @mention suggestions: author, reviewers, assignees, then commenters.
  const mentionPeople = useMemo(() => {
    if (!dialogPr) return undefined;
    const commenters = (d?.thread ?? []).flatMap((t) =>
      t.kind === 'comment' ? [t.comment.author] : t.kind === 'thread' ? t.comments.map((c) => c.author) : [],
    );
    return screenPeople(dialogPr.author, dialogPr.requested ?? [], dialogPr.assignees ?? [], commenters);
  }, [dialogPr, d]);
  const diffList = (
    <DiffList
      pr={selected}
      {...(fileHead ? { head: fileHead } : {})}
      diff={diff.data}
      loading={diff.loading}
      error={diff.error}
      files={files}
      scrollRef={diffRef}
      scrollRequest={scrollRequest}
      mode={mode}
      wrap={wrap}
      onToggleViewed={(p, v) => void toggleViewed(p, v)}
      onCurrent={setCurrentPath}
      {...(selected
        ? {
            inline: {
              repo: selected.repo,
              number: selected.number,
              ...(mentionPeople ? { people: mentionPeople } : {}),
              ...(inbox.data?.teams ? { teams: inbox.data.teams } : {}),
              hasPendingReview: (d?.pendingReview?.drafts ?? 0) > 0,
              onPosted: reloadAll,
            },
            threads: threadFiles,
          }
        : {})}
    />
  );

  const phoneTab: PhoneTab = phoneActivity ? 'activity' : listView;
  const setPhoneTab = (t: PhoneTab) => {
    setPhoneActivity(t === 'activity');
    if (t !== 'activity') switchView(t);
  };
  // Opening a sheet also selects the item, so the desktop layout shows it after a resize.
  const openSheet = (t: SheetTarget | undefined) => {
    setPhoneSheet(t);
    if (t?.kind === 'pr') setSelectedId(t.id);
    const issue = t?.kind === 'issue' ? issues.data?.issues.find((i) => i.id === t.id) : undefined;
    if (issue) setIssueTarget((x) => ({ repo: issue.repo, number: issue.number, n: (x?.n ?? 0) + 1 }));
  };

  if (phone) {
    return (
      <PhoneApp
        tab={phoneTab}
        onTab={setPhoneTab}
        inbox={inbox}
        issues={issues}
        activity={activity}
        seenLocal={seenLocal}
        issueSeen={issueSeen}
        sheet={phoneSheet}
        onSheet={openSheet}
        onSeenPr={openPr}
        onSeenIssue={(i) => {
          markIssueSeen(i.id);
          void api.issueSeen(i).catch(() => undefined);
        }}
        onRefresh={refresh}
        theme={theme}
        onToggleTheme={toggleTheme}
        density={density}
        onDensity={setDensity}
        overlay={updateToast}
      />
    );
  }

  return (
    <DensityContext.Provider value={density}>
    <LinkRouterContext.Provider value={routeLink}>
    <FollowContext.Provider value={inbox.follow}>
    <OrcaSessionsContext.Provider value={orcaUi.value}>
    <div className="app">
      <FollowStatus chips={inbox.follow.chips} prs={prById} />
      <Topbar
        view={listView}
        onView={switchView}
        prUnseen={prUnseen}
        issueUnseen={issueUnseen}
        activityUnseen={activityUnseen}
        items={searchItems}
        syncedAt={inbox.data?.syncedAt}
        rate={inbox.data?.rate}
        refreshDisabled={limited}
        refreshing={inbox.refreshing}
        syncing={inbox.syncing}
        theme={theme}
        searchRef={searchRef}
        narrow={narrow}
        onRefresh={refresh}
        onToggleTheme={toggleTheme}
        onPick={pickSearch}
        notify={{
          settings: notifySettings,
          onChange: setNotifySettings,
          density,
          onDensity: setDensity,
          orca: orcaUi.menu,
        }}
        pairOpen={pairing}
        onPairPhone={() => setPairing(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      {listView === 'activity' ? (
        <ActivityView
          activity={activity}
          active={!help && !pairing && !settingsShown}
          onOpen={(item) => openTarget({ kind: item.kind, repo: item.repo, number: item.number })}
          onHelp={() => setHelp(true)}
          onRefresh={refresh}
          onGoPrs={goPrs}
          onGoIssues={goIssues}
          onGoActivity={goActivity}
        />
      ) : listView === 'issues' ? (
        <IssuesView
          state={issues}
          layout={layout}
          seenLocal={issueSeen}
          onSeen={markIssueSeen}
          target={issueTarget}
          active={!help && !pairing && !settingsShown}
          onPair={() => setPairing(true)}
          searchRef={searchRef}
          onOpenPr={openPrFromIssue}
          onHelp={() => setHelp(true)}
          onGoPrs={goPrs}
          onRefresh={refresh}
          onNotice={(res) => orcaUi.handleNotice(res, false)}
          onOrcaHints={setOrcaHints}
          onFooterKeys={setFooterKeys}
        />
      ) : (
      <main
        className="panes"
        data-view={view}
        ref={panesRef}
        style={layout === 'one' ? undefined : { gridTemplateColumns: pw.columns }}
      >
          <InboxPane
            data={inbox.data}
            error={inbox.error}
            loading={inbox.loading}
            sections={sections}
            selectedId={effectiveId}
            filter={filter}
            filterRef={filterRef}
            listRef={listRef}
            narrow={narrow}
            onFilter={setFilter}
            onToggle={toggleSection}
            onSelect={select}
            onOpen={openPr}
            onRetry={reloadAll}
            onShowOrg={showOrg}
            closed={
              <ClosedSection
                state={closed.state}
                items={closedRows}
                narrow={narrow}
                renderRow={(pr) => (
                  <ClosedRow
                    key={pr.id}
                    id={pr.id}
                    repo={pr.repo}
                    number={pr.number}
                    title={pr.title}
                    author={pr.author}
                    closedAt={pr.closedAt}
                    url={pr.url}
                    state={closedPrState(pr)}
                    selected={pr.id === effectiveId}
                    onSelect={() => select(pr)}
                    onOpen={() => openPr(pr)}
                  />
                )}
                onToggle={closed.toggle}
                onWindow={closed.setWindow}
                onMore={closed.more}
                onRetry={closed.retry}
              />
            }
          />
        {layout !== 'one' ? handle(0, layout === 'three' ? 'Resize Inbox' : 'Resize Inbox and Review') : null}
        {layout === 'three' ? (
          <>
            <section className="pane detail-pane" aria-label="PR detail">
              <div className="pane-h pane-h-bare">PR DETAIL + FILES</div>
              <div className="scroll">
                {d && bodyProps ? (
                  <>
                    <PrHeader detail={d} />
                    <DetailBody {...bodyProps} />
                  </>
                ) : detail.error || !selected ? (
                  detail.error ? (
                    <div className="placeholder muted">{detail.error}</div>
                  ) : (
                    <EmptyPane title="Select a PR." hint="j k to move · Enter to open" />
                  )
                ) : (
                  <PrLoadingHeader pr={selected} />
                )}
              </div>
              {d ? (
                <ReviewBar detail={d} disabled={limited} access={access} onAction={startAction} onChanged={reloadAll} />
              ) : null}
            </section>
            {handle(1, 'Resize Detail')}
            <section className="pane diff-pane" aria-label="Diff">
              {toolbar}
              {diffList}
            </section>
          </>
        ) : (
          <ReviewPane
            detail={d}
            error={detail.error}
            disabled={limited}
            access={access}
            showBack={layout === 'one'}
            drawerOpen={drawer}
            toolbar={toolbar}
            diff={diffList}
            drawer={bodyProps ? <DetailBody {...bodyProps} /> : null}
            onAction={startAction}
            onBack={() => setView('inbox')}
            onToggleDrawer={() => setDrawer((o) => !o)}
          />
        )}
      </main>
      )}
      <Footer
        narrow={narrow}
        view={listView}
        extra={listView === 'issues' ? orcaHints : undefined}
        replace={listView === 'issues' ? footerKeys : undefined}
      />
      {action && dialogPr && d ? (
        <ActionDialog
          kind={action}
          pr={dialogPr}
          methodLabel={mergeMethodLabel(d.mergeMethod)}
          busy={busy}
          onConfirm={(b) => void runAction(b)}
          onCancel={() => setAction(undefined)}
          onUploadError={(message) => pushToast({ kind: 'err', message })}
          mentionPeople={mentionPeople}
          mentionTeams={inbox.data?.teams}
        />
      ) : null}
      <FixDialogs fix={fixDialogs} />
      {help ? (
        <HelpSheet onClose={() => setHelp(false)} keys={listView === 'issues' ? issueHelpKeys(bot()) : listView === 'activity' ? ACTIVITY_HELP_KEYS : undefined} />
      ) : null}
      {pairing ? <PairDialog onClose={() => setPairing(false)} /> : null}
      {settingsOpen ? <SettingsDialog initial={loadedSettings()} onClose={() => setSettingsOpen(false)} /> : null}
      {welcomeOpen && !settingsOpen ? <Welcome current={loadedSettings()} onClose={() => setWelcomeOpen(false)} /> : null}
      {orcaUi.overlays}
      <ToastStack items={toasts.items} raised={listView === 'issues'} />
      {updateToast}
    </div>
    </OrcaSessionsContext.Provider>
    </FollowContext.Provider>
    </LinkRouterContext.Provider>
    </DensityContext.Provider>
  );
}
