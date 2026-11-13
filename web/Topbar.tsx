import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { RateInfo } from '../shared/types';
import type { NotifySettings } from '../shared/notify-rules';
import { formatReset } from './inbox-utils';
import { clockFormatLabel, nextClockFormat, useClockFormat } from './time-format';
import type { Density } from './density';
import { api } from './api';
import { NotifyMenu } from './NotifyMenu';
import type { OrcaMenu } from './orca/useOrca';
import { orgLogin } from './org-settings';
import type { ListView } from './list-view';
import { Btn, KeyCap, formatNum } from './ui';
import { Logo } from './Logo';
import { mergeHits, missText, planSearch, type SearchItem } from './search-logic';
import { useNumberLookup } from './useNumberLookup';
import { repoLabel } from './repo-label';

export type { SearchItem } from './search-logic';

export type Theme = 'dark' | 'light';

interface SearchProps {
  narrow: boolean;
  /** Every listed PR and issue. Text queries match the current view's kind only. */
  items: SearchItem[];
  issues: boolean;
  onPick: (item: SearchItem) => void;
}

const Search = forwardRef<HTMLInputElement, SearchProps>(function Search({ items, onPick, narrow, issues }, ref) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [jump, setJump] = useState(false);
  const plan = useMemo(() => planSearch(items, q, issues ? 'issue' : 'pr'), [items, q, issues]);
  const lookup = useNumberLookup(plan.number?.number, plan.lookup, jump);
  const matches = useMemo(() => mergeHits(plan.results, lookup.hits), [plan.results, lookup.hits]);
  const n = plan.number?.number;
  const miss =
    n !== undefined && matches.length === 0 && lookup.done
      ? lookup.error ?? missText(n, plan.repos.length > 0 ? plan.repos : plan.number?.repo ? [plan.number.repo] : [])
      : undefined;

  const pick = (item: SearchItem) => {
    onPick(item);
    setQ('');
    setOpen(false);
    setJump(false);
  };

  // Enter on `Repo#n` before the lookup answers opens the item once it does.
  useEffect(() => {
    const only = matches[0];
    if (jump && lookup.done && matches.length === 1 && only) pick(only);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, lookup.done, matches]);

  return (
    <div className="search">
      <input
        ref={ref}
        value={q}
        placeholder={
          issues
            ? narrow
              ? 'Search issues'
              : 'Search or jump to an issue, repo or author'
            : narrow
              ? 'Search or jump (/)'
              : 'Search or jump to a PR, repo or author'
        }
        aria-label={issues ? 'Search or jump to an issue, repo or author' : 'Search or jump to a PR, repo or author'}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
          setJump(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQ('');
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((a) => (matches.length === 0 ? 0 : (a + step + matches.length) % matches.length));
          }
          if (e.key !== 'Enter') return;
          const chosen = matches[active] ?? matches[0];
          if (chosen) pick(chosen);
          else if (plan.number?.repo !== undefined && !lookup.done) setJump(true);
        }}
      />
      {narrow ? null : <KeyCap>/</KeyCap>}
      {open && (matches.length > 0 || miss) ? (
        <ul className="search-results">
          {matches.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={i === active ? 'is-active' : undefined} onMouseDown={() => pick(p)}>
                <span className={`search-kind is-${p.kind}`}>{p.kind === 'pr' ? 'PR' : 'Issue'}</span>{' '}
                <span className="muted">
                  {repoLabel(p.repo)} #{p.number}
                </span>{' '}
                <span>{p.title}</span>
              </button>
            </li>
          ))}
          {miss ? <li className="search-miss muted">{miss}</li> : null}
        </ul>
      ) : null}
    </div>
  );
});

function syncedLabel(syncedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - syncedAt) / 1000));
  return s < 60 ? `Synced ${s}s ago` : `Synced ${Math.round(s / 60)}m ago`;
}

function ApiBudget({ rate, now }: { rate: RateInfo; now: number }) {
  const [clock, cycleClock] = useClockFormat();
  const reset = formatReset(rate.resetAt, now, clock);
  const clockHint = `Time: ${clockFormatLabel(clock)}. Click for ${clockFormatLabel(nextClockFormat(clock))}`;
  const title =
    `GitHub GraphQL limit: ${formatNum(rate.limit)} points per hour. Resets at ${reset.at}. ` +
    'REST calls (diff patches) have their own separate 5,000 per hour.';
  return (
    <span className="api-budget muted" title={title}>
      <span className="api-full">
        API {formatNum(rate.remaining)} / {formatNum(rate.limit)} · resets{' '}
        <button type="button" className="clock-btn" title={clockHint} aria-label={clockHint} onClick={cycleClock}>
          {reset.at}
        </button>{' '}
        ({reset.left})
      </span>
      <span className="api-short">
        API {formatNum(rate.remaining)} · {reset.left}
      </span>
    </span>
  );
}

interface ViewSwitchProps {
  view: ListView;
  prUnseen: number;
  issueUnseen: number;
  activityUnseen: number;
  onView: (v: ListView) => void;
}

function UnseenBadge({ count, what }: { count: number; what: string }) {
  if (count <= 0) return null;
  const text = count > 99 ? '99+' : String(count);
  return (
    <span className="view-badge" title={`${count} unseen ${what}`}>
      {text}
    </span>
  );
}

/** PRs / Issues segmented switch. The inactive side carries its unseen count. */
function ViewSwitch({ view, prUnseen, issueUnseen, activityUnseen, onView }: ViewSwitchProps) {
  const seg = (v: ListView, label: string, unseen: number, what: string, key: string) => {
    const active = view === v;
    return (
      <button
        type="button"
        className={`view-seg${active ? ' is-active' : ''}`}
        aria-pressed={active}
        onClick={() => onView(v)}
        title={`${label} (${key})`}
      >
        <span>{label}</span>
        {active ? null : <UnseenBadge count={unseen} what={what} />}
        <KeyCap>{key}</KeyCap>
      </button>
    );
  };
  return (
    <div className="view-switch" role="group" aria-label="List view">
      {seg('prs', 'PRs', prUnseen, 'PRs', 'g p')}
      {seg('issues', 'Issues', issueUnseen, 'issues', 'g i')}
      {seg('activity', 'Activity', activityUnseen, 'activity items', 'g a')}
    </div>
  );
}

/** Badge text for the paired phone count. Nothing at 0, `9+` above 9. */
export function pairBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 9 ? '9+' : String(count);
}

function pairLabels(count: number): { title: string; label: string } {
  if (count <= 0) return { title: 'Pair phone (P)', label: 'Pair phone, no phones paired' };
  const noun = count === 1 ? '1 phone' : `${count} phones`;
  return { title: `Pair phone (P). ${noun} paired.`, label: `Pair phone, ${noun} paired` };
}

/**
 * Paired phone count, or undefined until loaded or when the request fails (the phone is not
 * loopback). Fetches on mount and each time the dialog closes.
 */
function usePairedCount(dialogOpen: boolean): number | undefined {
  const [count, setCount] = useState<number | undefined>();
  useEffect(() => {
    if (dialogOpen) return;
    let live = true;
    api
      .devices()
      .then((r) => live && setCount(r.devices.length))
      .catch(() => live && setCount(undefined));
    return () => {
      live = false;
    };
  }, [dialogOpen]);
  return count;
}

/** Opens the settings dialog (`,`). */
export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn icon-btn"
      aria-label="Settings"
      aria-keyshortcuts=","
      title="Settings (,)"
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
        </g>
      </svg>
    </button>
  );
}

export function PairButton({ count, onClick }: { count: number; onClick: () => void }) {
  const badge = pairBadge(count);
  const { title, label } = pairLabels(count);
  return (
    <button
      type="button"
      className={`btn icon-btn pair-btn${badge ? ' has-count' : ''}`}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.25" y="1.75" width="7.5" height="12.5" rx="2" />
          <path d="M7 12h2" />
        </g>
      </svg>
      {badge ? (
        <span className="view-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

interface TopbarProps {
  view: ListView;
  onView: (v: ListView) => void;
  prUnseen: number;
  issueUnseen: number;
  activityUnseen: number;
  items: SearchItem[];
  syncedAt: number | undefined;
  rate: RateInfo | undefined;
  refreshDisabled: boolean;
  /** A user refresh is running: Refresh shows its spinner. */
  refreshing: boolean;
  /** The server is syncing, for any reason: the age text reads Syncing... */
  syncing: boolean;
  theme: Theme;
  searchRef: React.Ref<HTMLInputElement>;
  narrow: boolean;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onPick: (item: SearchItem) => void;
  notify: {
    settings: NotifySettings;
    onChange: (next: NotifySettings) => void;
    density: Density;
    onDensity: (d: Density) => void;
    /** The Orca messages group. Absent when Orca is not reachable. */
    orca?: OrcaMenu | undefined;
  };
  pairOpen: boolean;
  onPairPhone: () => void;
  onSettings: () => void;
}

export function Topbar(p: TopbarProps) {
  const [now, setNow] = useState(Date.now());
  const pairCount = usePairedCount(p.pairOpen);
  const syncing = p.refreshing || p.syncing;
  const [syncNote, setSyncNote] = useState('');
  const wasRefreshing = useRef(false);

  // Only a user refresh is announced. Background syncs stay silent.
  useEffect(() => {
    if (p.refreshing) setSyncNote('Syncing');
    else if (wasRefreshing.current) setSyncNote('Synced');
    wasRefreshing.current = p.refreshing;
  }, [p.refreshing]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="topbar">
      <span className="app-name">
        <Logo size={20} />
        <span className="app-name-text">Nod</span>
      </span>
      <span className="org-chip">{orgLogin()}</span>
      <ViewSwitch
        view={p.view}
        prUnseen={p.prUnseen}
        issueUnseen={p.issueUnseen}
        activityUnseen={p.activityUnseen}
        onView={p.onView}
      />
      <Search ref={p.searchRef} items={p.items} issues={p.view === 'issues'} onPick={p.onPick} narrow={p.narrow} />
      <div className="top-right">
        <div className="top-icons">
          {pairCount === undefined ? null : <PairButton count={pairCount} onClick={p.onPairPhone} />}
          <SettingsButton onClick={p.onSettings} />
          <NotifyMenu
            settings={p.notify.settings}
            onChange={p.notify.onChange}
            density={p.notify.density}
            onDensity={p.notify.onDensity}
            orca={p.notify.orca}
          />
        </div>
        <button
          type="button"
          className="btn icon-btn"
          aria-label={`Switch to ${p.theme === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme"
          onClick={p.onToggleTheme}
        >
          {p.theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        {p.rate ? <ApiBudget rate={p.rate} now={now} /> : null}
        {syncing ? (
          <span className="muted sync-text">Syncing...</span>
        ) : p.syncedAt ? (
          <span className="muted sync-text">{syncedLabel(p.syncedAt, now)}</span>
        ) : null}
        <Btn
          keyHint="R"
          className={`btn-refresh${p.refreshing ? ' is-busy' : ''}`}
          disabled={p.refreshDisabled && !p.refreshing}
          aria-disabled={p.refreshing || undefined}
          aria-busy={p.refreshing || undefined}
          onClick={() => !p.refreshing && p.onRefresh()}
        >
          {p.refreshing ? <span className="spinner" aria-hidden="true" /> : null}
          Refresh
        </Btn>
        <span className="sr-only" role="status">
          {syncNote}
        </span>
      </div>
    </header>
  );
}
