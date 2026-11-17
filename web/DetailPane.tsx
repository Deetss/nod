import {
  AUTO_MERGE_ON,
  BYPASS_NOTE,
  bypassBusyNote,
  DRAFT_HINT,
  OWN_PR_HINT,
  type ReviewAccess,
} from '../shared/pr-actions';
import { BypassError, BypassMergeBtn, BypassStrip, type BypassControl } from './BypassMerge';
import { mergeMethodLabel, type PrDetail, type PrSummary } from '../shared/types';
import type { ActionKind } from './DetailBody';
import { CopyLinkButton } from './copy-link';
import { useDensityValue } from './density';
import { ClosedPill } from './ClosedSection';
import { useFollow } from './follow';
import { PrChip } from './PrChip';
import { PendingDrafts } from './PendingDrafts';
import { openExternal } from './links';
import { Btn, ExternalIcon, formatAge } from './ui';
import { repoLabel } from './repo-label';

const noop = () => {};

export function PrMeta({ detail }: { detail: PrDetail }) {
  const s = detail.summary;
  if (useDensityValue() === 'comfortable') {
    return (
      <div className="pr-meta muted ellipsis">
        {repoLabel(s.repo)} <span className="row-num">#{s.number}</span> · by {s.author} · opened {formatAge(s.createdAt)} ago
      </div>
    );
  }
  return (
    <div className="pr-meta muted ellipsis">
      {repoLabel(s.repo)} <span className="row-num">#{s.number}</span>
      {'  '}by {s.author}
      {'  '}opened {formatAge(s.createdAt)} ago
    </div>
  );
}

export function Branches({ detail }: { detail: PrDetail }) {
  const comfortable = useDensityValue() === 'comfortable';
  return (
    <div className="branches muted">
      <span className="base-label">{comfortable ? 'into' : 'base'}</span>
      <span className="chip chip-accent">{detail.baseRef}</span>
      <span>from</span>
      <span className="chip chip-accent" title={detail.headRef}>
        {detail.headRef}
      </span>
    </div>
  );
}

export function PrHeader({ detail }: { detail: PrDetail }) {
  const { kind } = useFollow(detail.summary.id, detail.summary.autoMerge);
  return (
    <div className="pr-header">
      <div className="pr-title-row">
        <h1 className="pr-title clamp2" title={detail.summary.title}>
          {detail.summary.title}
        </h1>
        {detail.summary.isDraft ? <span className="draft-chip">Draft</span> : null}
        <Btn className="pr-open" keyHint="O" onClick={() => openExternal(detail.summary.url)}>
          <ExternalIcon /> Open on GitHub
        </Btn>
        <CopyLinkButton url={detail.summary.url} variant="header" />
      </div>
      <PrMeta detail={detail} />
      <Branches detail={detail} />
      {detail.isOpen === false ? (
        <div className="closed-pr-pill">
          <ClosedPill state={detail.merged ? 'merged' : 'closed'} large />
        </div>
      ) : null}
      {kind ? (
        <div className="pr-chip-row">
          <PrChip kind={kind} />
        </div>
      ) : null}
    </div>
  );
}

/** Shown while a PR's detail loads: the list row's own fields, then a muted note. */
export function PrLoadingHeader({ pr }: { pr: PrSummary }) {
  return (
    <div className="pr-header">
      <div className="pr-title-row">
        <h1 className="pr-title clamp2" title={pr.title}>
          {pr.title}
        </h1>
      </div>
      <div className="pr-meta muted ellipsis">
        {repoLabel(pr.repo)} <span className="row-num">#{pr.number}</span>
        {'  '}by {pr.author}
      </div>
      <div className="placeholder muted">Loading details</div>
    </div>
  );
}

interface ActionBarProps {
  detail: PrDetail;
  disabled: boolean;
  access: ReviewAccess;
  onAction: (kind: ActionKind) => void;
}

/** Danger-styled Admin merge. Reads "waiting for checks" until every check passed, and "Draft" until the PR is ready. */
export function AdminMergeBtn({ disabled, access, onAction }: Omit<ActionBarProps, 'detail'>) {
  if (access.admin === 'hidden') return null;
  const waiting = access.admin === 'waiting';
  const draft = access.admin === 'draft';
  const label = draft ? DRAFT_HINT : waiting ? 'Admin merge: waiting for checks' : 'Admin merge';
  const title = draft ? DRAFT_HINT : waiting ? 'Every check must pass first' : 'Bypasses required review';
  return (
    <Btn className="btn-danger" keyHint="M" disabled={disabled || waiting || draft} title={title} onClick={() => onAction('admin')}>
      {label}
    </Btn>
  );
}

/** Greyed out once auto-merge is on, since pressing it again changes nothing. */
export function AutoMergeBtn({ detail, disabled, access, onAction }: ActionBarProps) {
  const on = detail.summary.autoMerge === true;
  const label = access.draft ? DRAFT_HINT : on ? AUTO_MERGE_ON : 'Auto-merge';
  return (
    <Btn
      keyHint="m"
      className={on ? 'btn-on' : undefined}
      disabled={disabled || access.draft || on}
      title={access.draft ? DRAFT_HINT : on ? AUTO_MERGE_ON : `Auto-merge: ${mergeMethodLabel(detail.mergeMethod)}`}
      onClick={() => onAction('merge')}
    >
      {label}
    </Btn>
  );
}

/** Takes a draft PR out of draft. Shown only for a draft the viewer authored. */
export function ReadyBtn({ disabled, access, onAction }: Omit<ActionBarProps, 'detail'>) {
  if (!access.draft || !access.ownPr) return null;
  return (
    <Btn keyHint="y" disabled={disabled} onClick={() => onAction('ready')}>
      Ready for review
    </Btn>
  );
}

export function ReviewButtons({ disabled, access, onAction }: Omit<ActionBarProps, 'detail'>) {
  const own = access.ownPr;
  const hint = own ? OWN_PR_HINT : undefined;
  return (
    <>
      <Btn primary keyHint="a" disabled={disabled || own} title={hint} onClick={() => onAction('approve')}>
        Approve
      </Btn>
      <Btn keyHint="r" disabled={disabled || own} title={hint} onClick={() => onAction('request')}>
        Request changes
      </Btn>
      <Btn keyHint="c" disabled={disabled} onClick={() => onAction('comment')}>
        Comment
      </Btn>
    </>
  );
}

/**
 * Pinned under the PR detail pane (docs/design/pr-detail-spec.md): review buttons at the left,
 * merge buttons at the right. A merged or closed PR has none.
 */
export function ReviewBar({
  detail,
  disabled,
  access,
  onAction,
  onChanged,
  bypass,
}: ActionBarProps & { onChanged?: () => void; bypass?: BypassControl }) {
  if (detail.isOpen === false) return null;
  const control = access.bypass ? bypass : undefined;
  if (control?.phase === 'confirm') return <BypassStrip detail={detail} control={control} />;
  const busy = control?.phase === 'busy';
  const off = disabled || busy;
  const method = disabled
    ? 'Actions are disabled until reset.'
    : detail.summary.autoMerge
      ? ''
      : mergeMethodLabel(detail.mergeMethod);
  return (
    <div className="review-bar" role="toolbar" aria-label="Review">
      {control?.error !== undefined ? <BypassError message={control.error} /> : null}
      <PendingDrafts detail={detail} disabled={off} onChanged={onChanged ?? noop} />
      <div className="review-bar-side">
        <ReviewButtons disabled={off} access={access} onAction={onAction} />
      </div>
      {access.ownPr ? <div className="review-bar-note muted small ellipsis">{ownPrNote(detail, access, busy)}</div> : null}
      <div className="review-bar-side review-bar-merge">
        <ReadyBtn disabled={off} access={access} onAction={onAction} />
        <AutoMergeBtn detail={detail} disabled={off} access={access} onAction={onAction} />
        <AdminMergeBtn disabled={off} access={access} onAction={onAction} />
        {control ? <BypassMergeBtn detail={detail} control={control} disabled={disabled} /> : null}
        {method ? <span className="merge-method muted small">{method}</span> : null}
      </div>
    </div>
  );
}

/** The own-PR line: today's hint, or the bypass wording while Merge (bypass) shows. */
export function ownPrNote(detail: PrDetail, access: ReviewAccess, busy: boolean): string {
  if (!access.bypass) return OWN_PR_HINT;
  return busy ? bypassBusyNote(detail.summary.number) : BYPASS_NOTE;
}
