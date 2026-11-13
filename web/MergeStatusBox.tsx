import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { latestChecks } from '../shared/fix-checks';
import {
  bucketChecks,
  buildStatusBox,
  checksStripText,
  checksTailLabel,
  orderChecks,
  ringSegments,
  visibleChecks,
  type ChecksRow,
  type StatusRow as StatusRowModel,
} from '../shared/status-box';
import type { CheckItem, PrDetail } from '../shared/types';
import { checkTime, isLive, useNow } from './ci';
import { FixButton, FixStatusLine } from './FixMenu';
import { openExternal } from './links';
import { ALL_FAILING, RESOLVE_SCOPE, type FixControls, type MenuControls } from './useFixChecks';
import {
  CancelledIcon,
  CheckIcon,
  ChecksRing,
  ClockIcon,
  ExternalIcon,
  ExtLink,
  KeyCap,
  RingIcon,
  RowGlyph,
  SkippedIcon,
  XIcon,
} from './ui';

const FLASH_MS = 1400;

/** Whether the checks list was left open, remembered for the session and shared by every PR. */
let rememberedOpen: boolean | undefined;

/** Test hook: forget the remembered choice. */
export function resetChecksMemory(): void {
  rememberedOpen = undefined;
}

/** Checks that left running or queued since the last render, keyed by name. */
function useFinished(checks: CheckItem[]): Record<string, 'pass' | 'fail'> {
  const prev = useRef<Map<string, CheckItem['status']>>(new Map());
  const [done, setDone] = useState<Record<string, 'pass' | 'fail'>>({});
  useEffect(() => {
    const fresh: Record<string, 'pass' | 'fail'> = {};
    for (const c of checks) {
      const was = prev.current.get(c.name);
      if (was && isLive({ status: was }) && (c.status === 'pass' || c.status === 'fail')) fresh[c.name] = c.status;
    }
    prev.current = new Map(checks.map((c) => [c.name, c.status]));
    if (Object.keys(fresh).length === 0) return;
    setDone((d) => ({ ...d, ...fresh }));
    const t = setTimeout(() => setDone({}), FLASH_MS);
    return () => clearTimeout(t);
  }, [checks]);
  return done;
}

function CheckIconFor({ status }: { status: CheckItem['status'] }) {
  if (status === 'pass') return <CheckIcon />;
  if (status === 'fail') return <XIcon />;
  if (status === 'cancelled') return <CancelledIcon />;
  if (status === 'skipped') return <SkippedIcon />;
  return <RingIcon motion={status === 'running' ? 'spin' : 'pulse'} />;
}

type Direction = 'up' | 'down' | 'right';

const CHEVRON: Record<Direction, string> = {
  up: 'M4 10l4-4 4 4',
  down: 'M4 6l4 4 4-4',
  right: 'M6 4l4 4-4 4',
};

function RowChevron({ dir }: { dir: Direction }) {
  return (
    <svg className="msb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={CHEVRON[dir]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface StatusRowProps {
  row: StatusRowModel;
  icon?: ReactNode;
  chevron: Direction;
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
}

/** One row of the box. The whole row is a button named by its headline, then its sub line. */
export function StatusRow({ row, icon, chevron, expanded, controls, onClick }: StatusRowProps) {
  return (
    <button
      type="button"
      className={`msb-row msb-row-${row.key}`}
      aria-label={row.sub ? `${row.headline}. ${row.sub}` : row.headline}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <span className={`msb-icon tone-${row.tone}`}>{icon ?? <RowGlyph name={row.glyph} />}</span>
      <span className="msb-text">
        <span className="msb-headline">{row.headline}</span>
        {row.sub ? <span className="msb-sub">{row.sub}</span> : null}
      </span>
      <RowChevron dir={chevron} />
    </button>
  );
}

export function StatusDetailRow({ label, glyph, onClick }: { label: string; glyph: 'diff' | 'clock'; onClick: () => void }) {
  return (
    <button type="button" className="msb-detail" onClick={onClick}>
      <span className="msb-detail-glyph">{glyph === 'diff' ? <RowGlyph name="diff" /> : <ClockIcon />}</span>
      <span>{label}</span>
      <RowChevron dir="right" />
    </button>
  );
}

interface ChecksListProps {
  checks: CheckItem[];
  fix: FixControls | undefined;
  id: string;
}

/** The approved checks table with its Fix controls, problems first. */
export function ChecksList({ checks: raw, fix, id }: ChecksListProps) {
  const checks = latestChecks(raw);
  const [all, setAll] = useState(false);
  const now = useNow(checks.some(isLive));
  const finished = useFinished(checks);
  const ordered = orderChecks(checks);
  const shown = visibleChecks(ordered, all);
  const tail = checksTailLabel(ordered, all);
  return (
    <div className="msb-checks checks-card" id={id}>
      <div className="msb-strip">
        <span className="msb-strip-title">Checks</span>
        <span className="msb-strip-sub">{checksStripText(shown.length, checks.length)}</span>
        {fix ? (
          <FixButton
            fix={fix}
            scope={ALL_FAILING}
            label={`Fix failing checks (${fix.failing.length})`}
            className="fix-all"
            keyHint="F"
          >
            Fix failing ({fix.failing.length}) <KeyCap>F</KeyCap>
          </FixButton>
        ) : null}
      </div>
      {fix?.status ? <FixStatusLine status={fix.status} /> : null}
      <div role="list" aria-label="Checks">
        {shown.map((c) => (
          <div
            role="listitem"
            className={`card-row check-row${finished[c.name] ? ` check-flash-${finished[c.name]}` : ''}`}
            key={c.name}
          >
            <span className={`check-icon check-${c.status}`}>
              <span className="icon-fade" key={c.status}>
                <CheckIconFor status={c.status} />
              </span>
            </span>
            <span className="ellipsis" title={c.name}>
              {c.name}
            </span>
            <span className={`check-word check-${c.status}`}>{c.status}</span>
            <span className="muted small check-time">{checkTime(c, now)}</span>
            <ExtLink href={c.url} label={`Open ${c.name} on GitHub`} />
            {fix && c.status === 'fail' ? (
              <FixButton fix={fix} scope={c.name} label={`Fix ${c.name}`} className="fix-row">
                Fix
              </FixButton>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      {tail ? (
        <button type="button" className="msb-tail" onClick={() => setAll((a) => !a)}>
          {tail}
          <RowChevron dir={all ? 'up' : 'down'} />
        </button>
      ) : null}
    </div>
  );
}

interface ChecksSectionProps {
  row: ChecksRow;
  checks: CheckItem[];
  fix: FixControls | undefined;
  /** Phone: the row opens the Checks tab instead of expanding a list. */
  onChecks?: () => void;
}

function ChecksSection({ row, checks, fix, onChecks }: ChecksSectionProps) {
  const listId = useId();
  const [choice, setChoice] = useState(rememberedOpen);
  const open = choice ?? row.openByDefault;
  const toggle = () => {
    rememberedOpen = !open;
    setChoice(!open);
  };
  const icon = <ChecksRing segments={ringSegments(bucketChecks(checks))} centre={row.centre} />;
  if (onChecks) return <StatusRow row={row} icon={icon} chevron="right" onClick={onChecks} />;
  return (
    <>
      <StatusRow
        row={row}
        icon={icon}
        chevron={open ? 'up' : 'down'}
        expanded={open}
        controls={listId}
        onClick={toggle}
      />
      {open ? <ChecksList checks={checks} fix={fix} id={listId} /> : null}
    </>
  );
}

/** Moves focus to the review a row points at, or to the Thread section when no card matches. */
export function focusThread(detail: PrDetail, kind: 'changes' | 'any'): void {
  const items = detail.thread ?? [];
  const review = [...items].reverse().find((i) => i.kind === 'review' && (kind === 'any' || i.verdict === 'changes'));
  const target =
    (review && review.kind === 'review' ? document.getElementById(`tl-${review.id}`) : null) ??
    document.getElementById('pr-thread');
  target?.scrollIntoView?.({ block: 'center' });
  target?.focus();
}

/** Under the conflict row: the Resolve menu button and a link to resolve on GitHub. */
export function ResolveStrip({ resolve, url }: { resolve: MenuControls; url: string }) {
  return (
    <div className="msb-resolve">
      <FixButton fix={resolve} scope={RESOLVE_SCOPE} label="Resolve conflicts" className="msb-resolve-btn">
        Resolve conflicts
        {resolve.busy ? <span className="spinner" aria-hidden="true" /> : <RowChevron dir="down" />}
      </FixButton>
      <a className="msb-gh-link" href={url} target="_blank" rel="noopener noreferrer">
        Resolve on GitHub
        <ExternalIcon />
      </a>
    </div>
  );
}

interface MergeStatusBoxProps {
  detail: PrDetail;
  fix: FixControls | undefined;
  /** Desktop and the Details drawer: the Resolve conflicts button, present for a conflicting open PR. */
  resolve?: MenuControls | undefined;
  /** Phone: opens the Checks tab from the checks row. */
  onChecks?: () => void;
  /** Phone: opens the Thread tab from the review rows. */
  onThread?: () => void;
  /** Phone, conflicting PR only: the mergeability row opens the fix sheet instead of GitHub. */
  onConflicts?: () => void;
}

export function MergeStatusBox({ detail, fix, resolve, onChecks, onThread, onConflicts }: MergeStatusBoxProps) {
  const box = buildStatusBox(detail);
  const open = () => openExternal(detail.summary.url);
  return (
    <section className="merge-box" aria-label="Merge status">
      {box.final ? <StatusRow row={box.final} chevron="right" onClick={open} /> : null}
      {box.review ? (
        <StatusRow row={box.review} chevron="down" onClick={() => (onThread ?? (() => focusThread(detail, 'any')))()} />
      ) : null}
      {box.details.map((d) => (
        <StatusDetailRow
          key={d.key}
          label={d.label}
          glyph={d.key === 'changes' ? 'diff' : 'clock'}
          onClick={() => (onThread ?? (() => focusThread(detail, d.key === 'changes' ? 'changes' : 'any')))()}
        />
      ))}
      {box.checks ? <ChecksSection row={box.checks} checks={detail.checks} fix={fix} onChecks={onChecks} /> : null}
      {box.mergeability ? <StatusRow row={box.mergeability} chevron="right" onClick={onConflicts ?? open} /> : null}
      {box.mergeability && resolve ? <ResolveStrip resolve={resolve} url={detail.summary.url} /> : null}
    </section>
  );
}
