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
  type PhoneTab,
} from './phone-logic';

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
}

const CLOSED_BY_DEFAULT = new Set(['org', 'dependabot', 'all']);
const TAB_ORDER = PHONE_TABS.map((t) => t.key);

export function PhoneApp(p: PhoneAppProps) {
  const { inbox, issues, seenLocal, issueSeen } = p;
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [prChip, setPrChip] = useState('all');
  const [issueChip, setIssueChip] = useState('all');
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
  const syncLine = syncText(inbox.data?.syncedAt, rate?.remaining, now);
  const cachedLine = `Cached ${stale?.cachedAt ?? ''} · actions off`.replace('  ', ' ');
  const errorDetail = inbox.error ?? issues.error ?? stale?.message ?? '';
  const refreshing = inbox.loading && inbox.data !== undefined;

  const statusFor = (hasData: boolean, total: number) =>
    phoneStatus({
      hasData,
      syncing: !!inbox.data?.syncing,
      error: inbox.error ?? issues.error,
      stale: !!stale,
      total,
    });

  const prTotal =
    prChip === 'all' ? prAllTotal(prSections) : (prSections.find((s) => s.key === prChip)?.count ?? 0);
  const issueTotal = issueSections.find((s) => s.key === (issueChip === 'all' ? 'all' : issueChip))?.count ?? 0;
  const prStatus = statusFor(inbox.data !== undefined, prTotal);
  const issueStatus = statusFor(issues.data !== undefined, issueTotal);

  const prOpen = resolveOpen(prSections, open, CLOSED_BY_DEFAULT);
  const isPrOpen = (key: string) => prChip !== 'all' || (prOpen[key] ?? true);
  const isIssueOpen = (key: string) =>
    issueChip !== 'all' || (open[key] ?? !CLOSED_BY_DEFAULT.has(key));

  const prViews: InboxSectionView[] = prSections
    .filter((s) => prChip === 'all' || s.key === prChip)
    .map((s) => ({
      key: s.key,
      title: s.title,
      count: s.count,
      open: isPrOpen(s.key),
      rows: s.prs.map((pr) => (
        <PrRow key={pr.id} pr={pr} onOpen={(x) => openRoot({ kind: 'pr', id: x.id })} />
      )),
    }));
  const issueViews: InboxSectionView[] = issueSections
    .filter((s) => issueChip === 'all' || s.key === issueChip)
    .map((s) => ({
      key: s.key,
      title: s.title,
      count: s.count,
      open: isIssueOpen(s.key),
      rows: s.issues.map((i) => (
        <IssueRow key={i.id} issue={i} showStatus={issues.data?.projectStatus === true} onOpen={(x) => openRoot({ kind: 'issue', id: x.id })} />
      )),
    }));

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

  // Swiping the content moves between the bottom tabs exactly as tapping them does.
  const pager = useTabPager(TAB_ORDER, p.tab, selectTab, { disabled: root !== undefined || menu });

  const openRoot = (t: SheetTarget) => {
    sheets.push(t);
    p.onSheet(t);
  };

  // Search is a layer: Back and the close button both leave it and clear the query.
  const setSearchingLayer = (on: boolean) => {
    if (on) {
      sheets.openLayer('search', () => {
        setQuery('');
        setSearching(false);
      });
      setSearching(true);
    } else {
      sheets.closeLayer('search');
      setQuery('');
      setSearching(false);
    }
  };

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

  return (
    <div className="phone" data-sheet={root ? 'open' : undefined}>
      <AppBar
        title={p.tab === 'activity' ? 'Activity' : 'Nod'}
        searching={searching}
        query={query}
        density={p.density}
        theme={p.theme}
        onQuery={setQuery}
        onSearching={setSearchingLayer}
        menu={menu}
        onMenu={setMenuLayer}
        onRefresh={p.onRefresh}
        onDensity={p.onDensity}
        onToggleTheme={p.onToggleTheme}
      />
      {apk.shown ? <ApkBanner release={apk.shown} onDismiss={apk.dismiss} /> : null}
      <main className="ph-main">
        <SwipePager
          pager={pager}
          panes={[
            <PhoneInbox
              chips={prChips(inbox.data?.sections ?? [])}
              chip={prChip}
              onChip={setPrChip}
              sections={prViews}
              status={prStatus}
              skeletonTitles={['Needs my review', 'Mine']}
              syncLine={syncLine}
              cachedLine={cachedLine}
              errorDetail={errorDetail}
              refreshing={refreshing}
              emptyTitle="Nothing needs you"
              emptyBody="No PRs need your attention."
              onToggle={(k) => toggle(k, isPrOpen(k))}
              onRefresh={p.onRefresh}
            />,
            <PhoneInbox
              chips={issueChips(issues.data?.sections ?? [])}
              chip={issueChip}
              onChip={setIssueChip}
              sections={issueViews}
              status={issueStatus}
              skeletonTitles={['Assigned to me', 'Created by me']}
              syncLine={syncLine}
              cachedLine={cachedLine}
              errorDetail={errorDetail}
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
      </main>
      <TabBar tab={p.tab} counts={{ ...unseen, activity: activityUnseen }} onTab={selectTab} indicatorRef={pager.swipe.indicatorRef} />
      <LinkRouterContext.Provider value={routeLink}>
      <PhoneSheets
        sheets={sheets}
        prs={inbox.data?.prs ?? []}
        issues={issues.data?.issues ?? []}
        viewer={inbox.data?.viewer ?? ''}
        projectStatus={issues.data?.projectStatus === true}
        writesOff={!!stale || !navigator.onLine}
        onChanged={() => {
          inbox.reload();
          issues.reload();
        }}
      />
      </LinkRouterContext.Provider>
      {p.overlay}
    </div>
  );
}
