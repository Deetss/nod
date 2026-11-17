import type { ReactNode } from 'react';
import { mergeMethodLabel, type PrDetail } from '../shared/types';
import type { ActionKind } from './DetailBody';
import { AUTO_MERGE_ON, type ReviewAccess } from '../shared/pr-actions';
import { BypassError, BypassMergeBtn, BypassStrip, type BypassControl } from './BypassMerge';
import { AdminMergeBtn, AutoMergeBtn, Branches, ownPrNote, PrMeta, ReviewButtons } from './DetailPane';
import { Btn, CiPill, formatNum } from './ui';
import { EmptyPane } from './Logo';

interface SummaryProps {
  detail: PrDetail;
  disabled: boolean;
  access: ReviewAccess;
  onAction: (kind: ActionKind) => void;
  bypass?: BypassControl | undefined;
}

function Summary({ detail, disabled, access, onAction, bypass }: SummaryProps) {
  const s = detail.summary;
  const control = access.bypass ? bypass : undefined;
  const busy = control?.phase === 'busy';
  const off = disabled || busy;
  return (
    <div className="summary">
      <h1 className="pr-title clamp2" title={s.title}>
        {s.title}
      </h1>
      <div className="summary-meta">
        <PrMeta detail={detail} />
        <Branches detail={detail} />
      </div>
      <div className="summary-pills">
        <CiPill state={s.ci} />
        <span className="pill-plain">{s.reviewStatus}</span>
        <span className="pill-plain">
          +{formatNum(s.additions)} -{formatNum(s.deletions)}, {s.changedFiles} files
        </span>
        <span className="pill-plain pill-accent">
          {detail.commitTotal} commits, {detail.newCommits} new
        </span>
      </div>
      {control?.phase === 'confirm' ? (
        <BypassStrip detail={detail} control={control} />
      ) : (
        <>
          {control?.error !== undefined ? <BypassError message={control.error} /> : null}
          <div className="action-row">
            <ReviewButtons disabled={off} access={access} onAction={onAction} />
            <AutoMergeBtn detail={detail} disabled={off} access={access} onAction={onAction} />
            <AdminMergeBtn disabled={off} access={access} onAction={onAction} />
            {control ? <BypassMergeBtn detail={detail} control={control} disabled={disabled} /> : null}
          </div>
          <div className="muted small">
            {disabled
              ? 'Actions are disabled until reset.'
              : access.ownPr
                ? ownPrNote(detail, access, busy)
                : detail.summary.autoMerge
                  ? AUTO_MERGE_ON
                  : `Auto-merge method: ${mergeMethodLabel(detail.mergeMethod)}`}
          </div>
        </>
      )}
    </div>
  );
}

interface ReviewPaneProps {
  detail: PrDetail | undefined;
  error: string | undefined;
  disabled: boolean;
  access: ReviewAccess;
  showBack: boolean;
  drawerOpen: boolean;
  toolbar: ReactNode;
  diff: ReactNode;
  drawer: ReactNode;
  onAction: (kind: ActionKind) => void;
  bypass?: BypassControl;
  onBack: () => void;
  onToggleDrawer: () => void;
}

/** One-column review pane used below 1400px: pinned summary, toolbar, diff, Details drawer. */
export function ReviewPane(p: ReviewPaneProps) {
  return (
    <section className="pane review-pane" aria-label="Review">
      <div className="pane-h">
        {p.showBack ? (
          <button type="button" className="btn back-btn" onClick={p.onBack}>
            Inbox
          </button>
        ) : null}
        <span className="pane-cap">REVIEW</span>
        <Btn className="details-btn" keyHint="t" aria-expanded={p.drawerOpen} onClick={p.onToggleDrawer}>
          Details
        </Btn>
      </div>
      {p.detail ? (
        <Summary detail={p.detail} disabled={p.disabled} access={p.access} onAction={p.onAction} bypass={p.bypass} />
      ) : (
        p.error ? (
          <div className="summary muted">{p.error}</div>
        ) : (
          <EmptyPane title="Select a PR to review." hint="j k to move · Enter to open" />
        )
      )}
      {p.toolbar}
      {p.diff}
      {p.drawerOpen && p.detail ? (
        <aside className="drawer" aria-label="Details">
          <div className="scroll">{p.drawer}</div>
        </aside>
      ) : null}
    </section>
  );
}
