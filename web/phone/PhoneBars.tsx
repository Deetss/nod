import { useState, type CSSProperties, type RefObject } from 'react';
import type { Density } from '../density';
import { ActivityIcon, CloseIcon, IssueIcon, MoreIcon, PrIcon, SearchIcon } from './PhoneIcons';
import { orgUrl } from '../org-settings';
import type { PhoneTab } from './phone-logic';
import { Logo } from '../Logo';
import { PhoneNotifySheet } from './PhoneNotifySheet';
import { usePush } from './usePush';

interface AppBarProps {
  title: string;
  searching: boolean;
  query: string;
  density: Density;
  theme: 'dark' | 'light';
  onQuery: (q: string) => void;
  onSearching: (on: boolean) => void;
  menu: boolean;
  onMenu: (on: boolean) => void;
  onRefresh: () => void;
  onDensity: (d: Density) => void;
  onToggleTheme: () => void;
}

export function AppBar(p: AppBarProps) {
  const menu = p.menu;
  const setMenu = p.onMenu;
  const push = usePush();
  const [notifySheet, setNotifySheet] = useState(false);
  const run = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  if (p.searching) {
    return (
      <header className="ph-appbar">
        <input
          className="ph-search"
          type="search"
          autoFocus
          placeholder="Search"
          aria-label="Search"
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
        />
        <button
          type="button"
          className="ph-iconbtn"
          aria-label="Close search"
          onClick={() => {
            p.onQuery('');
            p.onSearching(false);
          }}
        >
          <CloseIcon />
        </button>
      </header>
    );
  }
  return (
    <>
      {notifySheet ? <PhoneNotifySheet push={push} onClose={() => setNotifySheet(false)} /> : null}
      <header className="ph-appbar">
        <Logo size={24} />
        <h1 className="ph-apptitle">{p.title}</h1>
        <button type="button" className="ph-iconbtn" aria-label="Search" onClick={() => p.onSearching(true)}>
          <SearchIcon />
        </button>
        <button
          type="button"
          className="ph-iconbtn"
          aria-label="More"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreIcon />
        </button>
        {menu ? (
          <>
            <div className="ph-menu-scrim" onClick={() => setMenu(false)} />
            <div className="ph-menu" role="menu">
              <button type="button" role="menuitem" onClick={run(p.onRefresh)}>
                Refresh
              </button>
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
            </div>
          </>
        ) : null}
      </header>
    </>
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
