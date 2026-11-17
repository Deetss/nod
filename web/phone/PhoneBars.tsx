import { useId, useState, type CSSProperties, type RefObject } from 'react';
import type { Density } from '../density';
import { AlertIcon, ClockIcon } from '../ui';
import { ActivityIcon, IssueIcon, MoreIcon, PrIcon } from './PhoneIcons';
import { orgUrl } from '../org-settings';
import { syncTone, type PhoneTab, type SyncStatus } from './phone-logic';
import { PhoneNotifySheet } from './PhoneNotifySheet';
import { usePush } from './usePush';

interface AppBarProps {
  title: string;
  density: Density;
  theme: 'dark' | 'light';
  menu: boolean;
  onMenu: (on: boolean) => void;
  /** What the menu's status block says, and whether ··· carries the dot. */
  sync: SyncStatus;
  /** A refresh started elsewhere (a pull) is running. */
  syncing: boolean;
  /** Resolves false when the sync failed. */
  onRefresh: () => Promise<boolean>;
  onDensity: (d: Density) => void;
  onToggleTheme: () => void;
  onCheckUpdates: () => void;
}

export function AppBar(p: AppBarProps) {
  const menu = p.menu;
  const setMenu = p.onMenu;
  const push = usePush();
  const [notifySheet, setNotifySheet] = useState(false);
  const [running, setRunning] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const tone = syncTone(p.sync.problem);
  const run = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  // Sync now keeps the menu open; the block updates in place and the result is announced.
  const syncNow = () => {
    if (running || p.sync.problem === 'limited') return;
    setRunning(true);
    setAnnounce(false);
    void p.onRefresh().finally(() => {
      setRunning(false);
      setAnnounce(true);
    });
  };

  return (
    <>
      {notifySheet ? <PhoneNotifySheet push={push} onClose={() => setNotifySheet(false)} /> : null}
      <header className="ph-appbar">
        <h1 className="ph-apptitle">{p.title}</h1>
        <button
          type="button"
          className="ph-iconbtn ph-more"
          aria-label={tone ? 'More, sync problem' : 'More'}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreIcon />
          {tone ? <span className="ph-sync-dot" data-tone={tone} aria-hidden="true" /> : null}
        </button>
        <span className="sr-only" role="status">
          {announce ? p.sync.title : null}
        </span>
        {menu ? (
          <>
            <div className="ph-menu-scrim" onClick={() => setMenu(false)} />
            <div className="ph-menu" role="menu">
              <SyncBlock sync={p.sync} busy={running || p.syncing} onSync={syncNow} />
              <button
                type="button"
                role="menuitem"
                onClick={run(() => p.onDensity(p.density === 'comfortable' ? 'compact' : 'comfortable'))}
              >
                Density: {p.density === 'comfortable' ? 'Comfortable' : 'Compact'}
              </button>
              <button type="button" role="menuitem" onClick={run(p.onToggleTheme)}>
                Theme: {p.theme === 'dark' ? 'Dark' : 'Light'}
              </button>
              {push.state !== 'unsupported' ? (
                <button type="button" role="menuitem" onClick={run(() => setNotifySheet(true))}>
                  Notifications on this phone: {push.state === 'on' ? 'On' : push.state === 'blocked' ? 'Blocked' : 'Off'}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={run(() => window.open(orgUrl(),'_blank', 'noopener'))}
              >
                Open on GitHub
              </button>
              <button type="button" role="menuitem" onClick={run(p.onCheckUpdates)}>
                Check for updates
              </button>
            </div>
          </>
        ) : null}
      </header>
    </>
  );
}

/** The menu's first item: when it synced, the API budget, and Sync now. */
function SyncBlock({ sync, busy, onSync }: { sync: SyncStatus; busy: boolean; onSync: () => void }) {
  const titleId = useId();
  const tone = syncTone(sync.problem);
  return (
    <div className="ph-menu-status" role="group" aria-labelledby={titleId}>
      <span className="ph-menu-status-icon" data-tone={tone}>
        {tone ? <AlertIcon size={16} /> : <ClockIcon size={16} />}
      </span>
      <div className="ph-menu-status-text">
        <div id={titleId} className="ph-menu-status-title">
          {sync.title}
        </div>
        {sync.api ? <div className="ph-menu-status-api">{sync.api}</div> : null}
        {sync.reset ? <div className="ph-menu-status-reset">{sync.reset}</div> : null}
      </div>
      <button
        type="button"
        role="menuitem"
        className={`ph-btn ph-menu-sync${busy ? ' is-busy' : ''}`}
        disabled={busy || sync.problem === 'limited'}
        aria-busy={busy || undefined}
        onClick={onSync}
      >
        {busy ? (
          <>
            <span className="ph-spinner" aria-hidden="true" />
            Syncing…
          </>
        ) : (
          'Sync now'
        )}
      </button>
    </div>
  );
}

interface TabBarProps {
  tab: PhoneTab;
  counts: Record<PhoneTab, number>;
  onTab: (t: PhoneTab) => void;
  /** The active pill, which a swipe moves. */
  indicatorRef: RefObject<HTMLDivElement | null>;
}

export const PHONE_TABS: { key: PhoneTab; label: string; Icon: typeof PrIcon }[] = [
  { key: 'prs', label: 'PRs', Icon: PrIcon },
  { key: 'issues', label: 'Issues', Icon: IssueIcon },
  { key: 'activity', label: 'Activity', Icon: ActivityIcon },
];

export function TabBar({ tab, counts, onTab, indicatorRef }: TabBarProps) {
  return (
    <nav className="ph-tabbar" aria-label="Sections" style={{ '--tab-count': PHONE_TABS.length } as CSSProperties}>
      <div ref={indicatorRef} className="ph-tab-ind" aria-hidden="true" />
      {PHONE_TABS.map(({ key, label, Icon }) => {
        const n = counts[key];
        return (
          <button
            key={key}
            type="button"
            className={`ph-tab${tab === key ? ' is-active' : ''}`}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => onTab(key)}
          >
            <span className="ph-tab-icon">
              <Icon size={24} />
              {n > 0 ? (
                <span className="ph-count" aria-label={`${n} unseen`}>
                  {n}
                </span>
              ) : null}
            </span>
            <span className="ph-tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Chips({
  chips,
  value,
  onChange,
  showCounts = true,
}: {
  chips: { key: string; label: string; count: number | string }[];
  value: string;
  onChange: (k: string) => void;
  showCounts?: boolean;
}) {
  return (
    <div className="ph-chips" role="tablist">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={value === c.key}
          className={`ph-chip${value === c.key ? ' is-selected' : ''}`}
          onClick={() => onChange(c.key)}
        >
          {c.label}
          {showCounts ? <span className="ph-chip-count">{c.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
