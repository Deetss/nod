import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApkBanner, useApkUpdate } from './ApkBanner';
import type { IssueSummary } from '../../shared/issue-types';
import type { PrSummary } from '../../shared/types';
import type { Density } from '../density';
import { filterPrs } from '../inbox-utils';
import { exactFirst, matchesQuery } from '../../shared/number-query';
import { parseOpenParam } from '../../shared/build-update';
import { LinkRouterContext } from '../links';
import type { IssuesState } from '../issues/useIssues';
import type { Inbox } from '../useInbox';
import { PhoneActivity } from './PhoneActivity';
import { AppBar, PHONE_TABS, TabBar } from './PhoneBars';
import { PhoneInbox, type InboxSectionView } from './PhoneInbox';
import { IssueRow, PrRow } from './PhoneList';
import type { SheetTarget } from './PhoneSheet';
import { PhoneSheets } from './PhoneSheets';
import { SwipePager, useTabPager } from './SwipePager';
import { phoneLinkRouter } from './link-router';
import { useSheetStack } from './useSheetStack';
import { loadOpen, saveOpen } from './phone-collapsed';
import { activityBadge } from '../../shared/activity';
import type { ActivityHandle } from '../activity-ui';
import {
  issueChips,
  phoneStatus,
  prAllTotal,
  prChips,
  resolveOpen,
  syncText,
  tabTitle,
  type PhoneTab,
} from './phone-logic';
import { useLargeTitle } from './useLargeTitle';
import { useBarHide } from './useBarHide';
import { useKeyboardInset } from './useKeyboardInset';
import { flatResults, sectionShown, shownTotal, toggleFilter, type FilterSet } from './bottom-search';
import { BottomBar, SearchBand, SearchResults } from './PhoneSearch';
import { PhoneFilterSheet } from './PhoneFilterSheet';
import { projectOff } from '../../shared/connection';
import { clockOf, tokenBlocks } from '../Banner';
import type { ConnectionView } from '../settings/useConnection';
import { PhoneConnectionSheet } from './PhoneConnectionSheet';
import { useUpdateCheck } from './useUpdateCheck';
import { PhoneQuietNote, SyncFailedBanner, TokenBannerPhone } from './PhoneStates';

interface PhoneAppProps {
  tab: PhoneTab;
  onTab: (t: PhoneTab) => void;
  inbox: Inbox;
  issues: IssuesState;
  activity: ActivityHandle;
  /** PR ids and issue ids opened this session. */
  seenLocal: ReadonlySet<string>;
  issueSeen: ReadonlySet<string>;
  sheet: SheetTarget | undefined;
  onSheet: (t: SheetTarget | undefined) => void;
  /** Called when a sheet closes, which clears the item's unseen state. */
  onSeenPr: (pr: PrSummary) => void;
  onSeenIssue: (issue: IssueSummary) => void;
  onRefresh: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  density: Density;
  onDensity: (d: Density) => void;
  /** The update toast, drawn over the sheets. */
  overlay?: ReactNode;
  /** The GitHub token's state, for the banners and the How to fix sheet. */
  connection: ConnectionView;
}

const CLOSED_BY_DEFAULT = new Set(['org', 'dependabot', 'all']);
const TAB_ORDER = PHONE_TABS.map((t) => t.key);

export function PhoneApp(p: PhoneAppProps) {
  const { inbox, issues, seenLocal, issueSeen } = p;
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const updates = useUpdateCheck();
  const [prFilters, setPrFilters] = useState<FilterSet>(() => new Set());
  const [issueFilters, setIssueFilters] = useState<FilterSet>(() => new Set());
  const [filterSheet, setFilterSheet] = useState(false);
  const keyboard = useKeyboardInset();
  const [open, setOpen] = useState(loadOpen);
  const [, setTick] = useState(0);
  const apk = useApkUpdate();

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const toggle = useCallback((key: string, current: boolean) => {
    setOpen((o) => {
      const next = { ...o, [key]: !current };
      saveOpen(next);
      return next;
    });
  }, []);

  const prSections = useMemo(
    () =>
      (inbox.data?.sections ?? []).map((s) => ({
        ...s,
        prs: filterPrs(s.prs, query)
          .map((pr) => (seenLocal.has(pr.id) ? { ...pr, seen: 'seen' as const, updatedNote: undefined } : pr)),
      })),
    [inbox.data, query, seenLocal],
  );
  const issueSections = useMemo(
    () =>
      (issues.data?.sections ?? []).map((s) => ({
        ...s,
        issues: exactFirst(
          s.issues.filter((i) => matchesQuery(i, query, `${i.repo} ${i.author} ${i.title}`)),
          query,
        )
          .map((i) => (issueSeen.has(i.id) ? { ...i, seen: 'seen' as const, updatedNote: undefined } : i)),
      })),
    [issues.data, query, issueSeen],
  );

  // An expanded Activity row is a layer: Back collapses it before it leaves the tab.
  const [expandedRow, setExpandedRow] = useState<string>();
  const setExpanded = (key: string | undefined) => {
    if (key === undefined) {
      sheets.closeLayer('activity-row');
      setExpandedRow(undefined);
      return;
    }
    if (expandedRow === undefined) sheets.openLayer('activity-row', () => setExpandedRow(undefined));
    setExpandedRow(key);
  };

  const now = Date.now();
  const rate = inbox.data?.rate ?? issues.data?.rate;
  const stale = inbox.data?.stale ?? issues.data?.stale;
  const conn = p.connection.connection;
  // No token, or no `repo`: sync is paused, the token banner shows, and writes are off.
  const blocked = tokenBlocks(conn);
  const syncLine = syncText(inbox.data?.syncedAt, rate?.remaining, now);
  const cachedAt = stale && !blocked ? stale.cachedAt : clockOf(inbox.data?.syncedAt ?? 0);
  const cachedLine = conn?.state === 'none' ? 'Nothing synced yet.' : `Cached ${cachedAt} · actions off`;
  const errorDetail = inbox.error ?? issues.error ?? stale?.message ?? '';
  const refreshing = inbox.loading && inbox.data !== undefined;

  const [connSheet, setConnSheet] = useState(false);
  const setConnLayer = (on: boolean) => {
    if (on) {
      sheets.openLayer('connection', () => setConnSheet(false));
      setConnSheet(true);
    } else {
      sheets.closeLayer('connection');
      setConnSheet(false);
      p.connection.clearResult();
    }
  };
  const listBanner =
    blocked && conn ? (
      <TokenBannerPhone connection={conn} cachedAt={cachedAt} onFix={() => setConnLayer(true)} />
    ) : stale && !inbox.error && !issues.error ? (
      <SyncFailedBanner stale={stale} onRetry={p.onRefresh} />
    ) : undefined;
  const issueNotice = projectOff(conn) && !blocked ? <PhoneQuietNote onTurnOn={() => setConnLayer(true)} /> : undefined;

  const statusFor = (hasData: boolean, total: number) =>
    phoneStatus({
      hasData,
      syncing: !!inbox.data?.syncing,
      error: inbox.error ?? issues.error,
      stale: !!stale || blocked,
      total,
    });

  const prShown = prSections.filter((s) => sectionShown(prFilters, s.key));
  const issueShown = issueSections.filter((s) => sectionShown(issueFilters, s.key));
  const prTotal = prFilters.size === 0 ? prAllTotal(prSections) : shownTotal(prShown.map((s) => ({ items: s.prs })));
  const issueTotal =
    issueFilters.size === 0
      ? (issueSections.find((s) => s.key === 'all')?.count ?? 0)
      : shownTotal(issueShown.map((s) => ({ items: s.issues })));
  const prStatus = statusFor(inbox.data !== undefined, prTotal);
  const issueStatus = statusFor(issues.data !== undefined, issueTotal);

  const prOpen = resolveOpen(prSections, open, CLOSED_BY_DEFAULT);
  const isPrOpen = (key: string) => prFilters.size > 0 || (prOpen[key] ?? true);
  const isIssueOpen = (key: string) =>
    issueFilters.size > 0 || (open[key] ?? !CLOSED_BY_DEFAULT.has(key));

  const prRow = (pr: PrSummary) => <PrRow key={pr.id} pr={pr} onOpen={(x) => openRoot({ kind: 'pr', id: x.id })} />;
  const issueRow = (i: IssueSummary) => (
    <IssueRow key={i.id} issue={i} showStatus={issues.data?.projectStatus === true} onOpen={(x) => openRoot({ kind: 'issue', id: x.id })} />
  );

  const prViews: InboxSectionView[] = prShown.map((s) => ({
    key: s.key,
    title: s.title,
    count: s.count,
    open: isPrOpen(s.key),
    rows: s.prs.map(prRow),
  }));
  const issueViews: InboxSectionView[] = issueShown.map((s) => ({
    key: s.key,
    title: s.title,
    count: s.count,
    open: isIssueOpen(s.key),
    rows: s.issues.map(issueRow),
  }));

  const prFilterRows = prChips(inbox.data?.sections ?? []).filter((c) => c.key !== 'all');
  const issueFilterRows = issueChips(issues.data?.sections ?? []).filter((c) => c.key !== 'all');

  const unseen = {
    prs: prStatus === 'loading' ? 0 : (inbox.data?.prs ?? []).filter((x) => x.seen !== 'seen' && !seenLocal.has(x.id)).length,
    issues: issueStatus === 'loading' ? 0 : (issues.data?.issues ?? []).filter((x) => x.seen !== 'seen' && !issueSeen.has(x.id)).length,
  };

  const activityUnseen = p.activity.feed ? activityBadge(p.activity.feed, p.activity.lastVisit) : 0;

  const selectTab = (t: PhoneTab) => {
    if (expandedRow !== undefined && t !== p.tab) setExpanded(undefined);
    if (t === p.tab) document.querySelector('.ph-pane.is-active .ph-list')?.scrollTo({ top: 0 });
    // Leaving PRs for a non-default tab adds one history entry, so Back returns to PRs once.
    // Returning to PRs from the tab bar removes that entry again.
    if (t !== 'prs' && p.tab === 'prs') sheets.openLayer('tab', () => p.onTab('prs'));
    if (t === 'prs' && p.tab !== 'prs') sheets.closeLayer('tab');
    p.onTab(t);
  };

  const sheets = useSheetStack(p.sheet ? [p.sheet] : []);
  const root = sheets.stack[0];
  const shell = useRef<HTMLDivElement>(null);
  useLargeTitle(shell, p.tab, searching);

  // Swiping the content moves between the bottom tabs exactly as tapping them does.
  const pager = useTabPager(TAB_ORDER, p.tab, selectTab, { disabled: root !== undefined || menu || searching });

  const openRoot = (t: SheetTarget) => {
    sheets.push(t);
    p.onSheet(t);
  };

  // Search is a layer: Back, Cancel and Escape all leave it, clear the query and return focus to the pill.
  const leaveSearch = () => {
    setQuery('');
    setSearching(false);
    requestAnimationFrame(() => shell.current?.querySelector<HTMLElement>('.ph-pill')?.focus({ preventScroll: true }));
  };
  const setSearchingLayer = (on: boolean) => {
    if (on) {
      sheets.openLayer('search', leaveSearch);
      setSearching(true);
    } else {
      sheets.closeLayer('search');
      leaveSearch();
    }
  };

  // The filter sheet is a layer: Back, the scrim, Close and Done all shut it.
  const setFilterLayer = (on: boolean) => {
    if (on) {
      sheets.openLayer('filter', () => setFilterSheet(false));
      setFilterSheet(true);
    } else {
      sheets.closeLayer('filter');
      setFilterSheet(false);
    }
  };

  const onPrs = p.tab === 'prs';
  const listTab = onPrs || p.tab === 'issues';
  const filters = onPrs ? prFilters : issueFilters;
  const setFilters = onPrs ? setPrFilters : setIssueFilters;
  const filterRows = onPrs ? prFilterRows : issueFilterRows;
  const filtersOn = filterRows.filter((r) => filters.has(r.key)).length;
  const placeholder = onPrs ? 'Search pull requests' : 'Search issues';
  useBarHide(shell, `${p.tab} ${searching} ${filterSheet} ${root ? 'sheet' : ''}`);

  // A typed query swaps the active list for flat results, within the ticked filters.
  const results =
    listTab && searching && query.trim() ? (
      <SearchResults
        query={query}
        filterLabels={filterRows.filter((r) => filters.has(r.key)).map((r) => r.label)}
        onClearFilters={() => setFilters(new Set())}
        onEscape={() => setSearchingLayer(false)}
      >
        {onPrs
          ? flatResults(prShown.map((s) => ({ items: s.prs }))).map(prRow)
          : flatResults(issueShown.map((s) => ({ items: s.issues }))).map(issueRow)}
      </SearchResults>
    ) : undefined;

  // The app bar menu is a layer too: Back and a tap outside both close it.
  const setMenuLayer = (on: boolean) => {
    if (on) {
      sheets.openLayer('menu', () => setMenu(false));
      setMenu(true);
    } else {
      sheets.closeLayer('menu');
      setMenu(false);
    }
  };

  // Links in bodies and comments open the loaded item as a new sheet, so back returns to the sheet they were in.
  const routeLink = useMemo(
    () => phoneLinkRouter(inbox.data?.prs ?? [], issues.data?.issues ?? [], sheets.push),
    [inbox.data, issues.data, sheets.push],
  );

  // A notification tap opens `/?open=pr/<owner>/<name>/<number>`. The link is used once the lists have loaded.
  useEffect(() => {
    const open = new URLSearchParams(window.location.search).get('open');
    if (!open || !inbox.data || !issues.data) return;
    const ref = parseOpenParam(open);
    const items = ref?.kind === 'pr' ? inbox.data.prs : issues.data.issues;
    const id = items.find((x) => x.repo === ref?.repo && x.number === ref?.number)?.id;
    // The navigation made this history entry, so the sheet is written into it and not pushed.
    if (ref && id) {
      sheets.openFromNavigation({ kind: ref.kind, id });
      p.onSheet({ kind: ref.kind, id });
    } else {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [inbox.data, issues.data]);

  // Closing the root sheet clears the item's unseen state and tells the parent.
  const openedRoot = useRef<SheetTarget>(undefined);
  useEffect(() => {
    const prev = openedRoot.current;
    openedRoot.current = root as SheetTarget | undefined;
    if (!prev || root) return;
    const pr = prev.kind === 'pr' ? inbox.data?.prs.find((x) => x.id === prev.id) : undefined;
    const issue = prev.kind === 'issue' ? issues.data?.issues.find((x) => x.id === prev.id) : undefined;
    if (pr) p.onSeenPr(pr);
    if (issue) p.onSeenIssue(issue);
    p.onSheet(undefined);
  }, [root]);

  // While searching, the shell ends on the keyboard so the search band sits on top of it.
  return (
    <div
      ref={shell}
      className={`phone${searching ? ' is-searching' : ''}${listTab ? ' has-bottombar' : ''}`}
      data-sheet={root ? 'open' : undefined}
      style={searching && keyboard ? { bottom: 'auto', height: keyboard } : undefined}
    >
      {apk.shown ? <ApkBanner release={apk.shown} onDismiss={apk.dismiss} /> : null}
      <main className="ph-main">
        <AppBar
          title={tabTitle(p.tab)}
          density={p.density}
          theme={p.theme}
          menu={menu}
          onMenu={setMenuLayer}
          onRefresh={p.onRefresh}
          onDensity={p.onDensity}
          onToggleTheme={p.onToggleTheme}
          onCheckUpdates={updates.check}
        />
        <SwipePager
          pager={pager}
          panes={[
            <PhoneInbox
              results={onPrs ? results : undefined}
              sections={prViews}
              status={prStatus}
              skeletonTitles={['Needs my review', 'Mine']}
              syncLine={syncLine}
              cachedLine={cachedLine}
              errorDetail={errorDetail}
              banner={listBanner}
              refreshing={refreshing}
              emptyTitle="Nothing needs you"
              emptyBody="No PRs need your attention."
              onToggle={(k) => toggle(k, isPrOpen(k))}
              onRefresh={p.onRefresh}
            />,
            <PhoneInbox
              results={onPrs ? undefined : results}
              sections={issueViews}
              status={issueStatus}
              skeletonTitles={['Assigned to me', 'Created by me']}
              syncLine={syncLine}
              cachedLine={cachedLine}
              errorDetail={errorDetail}
              banner={listBanner}
              notice={issueNotice}
              refreshing={refreshing}
              emptyTitle="Nothing needs you"
              emptyBody="No issues need your attention."
              onToggle={(k) => toggle(k, isIssueOpen(k))}
              onRefresh={p.onRefresh}
            />,
            <PhoneActivity
              activity={p.activity}
              refreshing={refreshing}
              onRefresh={p.onRefresh}
              onOpen={(i) => openRoot({ kind: i.kind, id: i.id })}
              expanded={expandedRow}
              onExpand={setExpanded}
            />,
          ]}
        />
        {listTab && !searching ? (
          <BottomBar
            placeholder={placeholder}
            filtersOn={filtersOn}
            onSearch={() => setSearchingLayer(true)}
            onFilters={() => setFilterLayer(true)}
          />
        ) : null}
      </main>
      {searching ? (
        <SearchBand
          placeholder={placeholder}
          query={query}
          keyboard={keyboard !== undefined}
          onQuery={setQuery}
          onCancel={() => setSearchingLayer(false)}
        />
      ) : null}
      <TabBar tab={p.tab} counts={{ ...unseen, activity: activityUnseen }} onTab={selectTab} indicatorRef={pager.swipe.indicatorRef} />
      {filterSheet && listTab ? (
        <PhoneFilterSheet
          title={onPrs ? 'Filter pull requests' : 'Filter issues'}
          sub={onPrs ? 'A PR shows if it is in any ticked section' : 'An issue shows if it is in any ticked section'}
          rows={filterRows}
          value={filters}
          onToggle={(k) => setFilters((s) => toggleFilter(s, k))}
          onClear={() => setFilters(new Set())}
          onClose={() => setFilterLayer(false)}
        />
      ) : null}
      {updates.toast ? (
        <div className={`ph-toast${updates.toast.ok ? '' : ' is-error'}`} role="status">
          {updates.toast.message}
        </div>
      ) : null}
      <LinkRouterContext.Provider value={routeLink}>
      <PhoneSheets
        sheets={sheets}
        prs={inbox.data?.prs ?? []}
        issues={issues.data?.issues ?? []}
        viewer={inbox.data?.viewer ?? ''}
        projectStatus={issues.data?.projectStatus === true}
        writesOff={!!stale || blocked || !navigator.onLine}
        onChanged={() => {
          inbox.reload();
          issues.reload();
        }}
      />
      </LinkRouterContext.Provider>
      {connSheet ? <PhoneConnectionSheet view={p.connection} onClose={() => setConnLayer(false)} /> : null}
      {p.overlay}
    </div>
  );
}
