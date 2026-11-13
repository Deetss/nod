import { useEffect, useRef, type ReactNode } from 'react';
import {
  CLOSED_PILL,
  CLOSED_WINDOWS,
  closedCount,
  closedMeta,
  emptyLabel,
  isClosedWindow,
  loadMoreLabel,
  sectionTitle,
  windowLabel,
  type ClosedSectionState,
  type ClosedState,
  type ClosedWindow,
} from '../shared/closed';
import { Dropdown } from './issues/Dropdown';
import { CircleCheckIcon, SlashCircleIcon } from './issues/parts';
import { useDensityValue } from './density';
import { repoLabel } from './repo-label';
import { RowMeta } from './RowMeta';
import { Btn, Chevron, KeyCap, formatAge } from './ui';
import { captureScrollsClosed } from './useClosed';

/** Merge glyph, the same mark as the Auto-merge chip in `PrChip.tsx`. */
function MergeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="3.5" r="1.6" />
      <circle cx="4.5" cy="12.5" r="1.6" />
      <circle cx="11.5" cy="8.5" r="1.6" />
      <path d="M4.5 5.1v5.8M4.5 5.5c0 2.2 2.6 3 5.4 3" />
    </svg>
  );
}

/** A ring with a cross inside: closed without merging. */
function CrossCircleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
    </svg>
  );
}

/** A dashed ring with a slash: closed as not planned. */
function DashedSlashIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" strokeDasharray="2.4 2.2" />
      <path d="M4.2 11.8l7.6-7.6" />
    </svg>
  );
}

export function ClosedIcon({ state, size = 12 }: { state: ClosedState; size?: number }) {
  switch (state) {
    case 'merged':
      return <MergeIcon size={size} />;
    case 'closed':
      return <CrossCircleIcon size={size} />;
    case 'completed':
      return <CircleCheckIcon size={size} />;
    case 'not-planned':
      return size === 12 ? <DashedSlashIcon size={size} /> : <SlashCircleIcon size={size} />;
  }
}

/** Icon plus the state word. The icon shape, the word and the outline each tell the states apart. */
export function ClosedPill({ state, large }: { state: ClosedState; large?: boolean }) {
  return (
    <span className={`closed-pill closed-${state}${large ? ' is-large' : ''}`}>
      <ClosedIcon state={state} size={large ? 14 : 12} />
      {CLOSED_PILL[state]}
    </span>
  );
}

interface ClosedRowProps {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  closedAt: string;
  url: string;
  state: ClosedState;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

/** A read-only row: no unseen dot, no badge and no action chips. */
export function ClosedRow(p: ClosedRowProps) {
  const comfortable = useDensityValue() === 'comfortable';
  const rowProps = {
    id: `row-${p.id}`,
    role: 'option',
    'aria-selected': p.selected,
    className: `row closed-row${p.selected ? ' is-selected' : ''}`,
    onClick: p.onSelect,
    onDoubleClick: p.onOpen,
  };
  if (comfortable) {
    return (
      <div {...rowProps}>
        <div className="row-titleline">
          <div className="row-title clamp2" title={p.title}>
            {p.title}
          </div>
        </div>
        <div className="row-ci">
          <ClosedPill state={p.state} />
        </div>
        <div className="row-meta muted">
          <span className="ellipsis">
            <RowMeta repo={p.repo} number={p.number} author={p.author} age={formatAge(p.closedAt)} />
          </span>
        </div>
      </div>
    );
  }
  return (
    <div {...rowProps}>
      <div className="row-l1 muted">
        <span className="ellipsis">
          {repoLabel(p.repo)} <span className="row-num">#{p.number}</span>
        </span>
        <ClosedPill state={p.state} />
        <span className="row-age">{formatAge(p.closedAt)}</span>
      </div>
      <div className="row-title clamp2" title={p.title}>
        {p.title}
      </div>
      <div className="row-l3 muted">
        <span className="ellipsis row-author">{closedMeta(p.author, p.state)}</span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="skeleton-row" key={i}>
          <div className="sk" style={{ width: '40%' }} />
          <div className="sk" style={{ width: '82%' }} />
          <div className="sk" style={{ width: '56%' }} />
        </div>
      ))}
    </div>
  );
}

interface ClosedSectionProps<T> {
  state: ClosedSectionState<T>;
  /** The rows to show, after any list filter. Defaults to every row loaded. */
  items?: readonly T[];
  narrow: boolean;
  renderRow: (item: T) => ReactNode;
  onToggle: () => void;
  onWindow: (w: ClosedWindow) => void;
  onMore: () => void;
  onRetry: () => void;
}

/** The collapsed `Closed · last 30 days` section at the foot of a list, same pattern as Dependabot. */
export function ClosedSection<T>(p: ClosedSectionProps<T>) {
  const s = p.state;
  const top = useRef<HTMLElement>(null);
  // Fixture captures bring the section into view, once its rows arrive when it starts open.
  useEffect(() => {
    const el = top.current;
    const box = el?.closest<HTMLElement>('.inbox-list');
    if (!el || !box || !captureScrollsClosed() || (s.open && s.status !== 'ready')) return;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top;
  }, [s.open, s.status]);
  const rows = p.items ?? s.items;
  const body = (() => {
    if (!s.open) return null;
    if (s.status === 'loading' || s.status === 'idle') return <Skeleton />;
    if (s.status === 'error') {
      return (
        <div className="banner banner-error" role="alert">
          <div className="banner-main">
            <div className="banner-title">Could not load closed items</div>
            <div className="banner-detail">{s.error}</div>
            <div className="banner-actions">
              <Btn onClick={p.onRetry}>Retry</Btn>
            </div>
          </div>
        </div>
      );
    }
    return (
      <>
        {rows.length === 0 ? <div className="closed-empty muted">{emptyLabel(s.window)}</div> : rows.map(p.renderRow)}
        {s.error ? (
          <div className="banner banner-error" role="alert">
            <div className="banner-main">
              <div className="banner-detail">{s.error}</div>
            </div>
          </div>
        ) : null}
        {s.hasMore && rows.length > 0 ? (
          <div className="closed-more">
            <Btn onClick={p.onMore} disabled={s.more}>
              <span className="closed-more-label">{s.more ? 'Loading…' : loadMoreLabel(s.window)}</span>
            </Btn>
          </div>
        ) : null}
      </>
    );
  })();

  return (
    <section aria-label="Closed items" ref={top}>
      <button type="button" className="sec-h" aria-expanded={s.open} onClick={p.onToggle}>
        <Chevron open={s.open} />
        <span className="sec-name">{sectionTitle(s.window)}</span>
        <span className="count">{closedCount(s)}</span>
      </button>
      {s.open ? (
        <div className="closed-window">
          <Dropdown
            label={windowLabel(s.window)}
            shortLabel={windowLabel(s.window)}
            narrow={p.narrow}
            active={false}
            value={String(s.window)}
            options={CLOSED_WINDOWS.map((w) => ({ value: String(w), label: windowLabel(w) }))}
            onChange={(v) => {
              const n = Number(v);
              if (isClosedWindow(n)) p.onWindow(n);
            }}
          />
          <span className="muted small">newest first</span>
          <KeyCap>W</KeyCap>
        </div>
      ) : null}
      {body}
    </section>
  );
}
