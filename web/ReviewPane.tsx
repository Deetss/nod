import type { ReactNode } from 'react';
import { mergeMethodLabel, type PrDetail } from '../shared/types';
import type { ActionKind } from './DetailBody';
import { AUTO_MERGE_ON, OWN_PR_HINT, type ReviewAccess } from '../shared/pr-actions';
import { AdminMergeBtn, AutoMergeBtn, Branches, PrMeta, ReviewButtons } from './DetailPane';
import { Btn, CiPill, formatNum } from './ui';
import { EmptyPane } from './Logo';

interface SummaryProps {
  detail: PrDetail;
  disabled: boolean;
  access: ReviewAccess;
  onAction: (kind: ActionKind) => void;
}

function Summary({ detail, disabled, access, onAction }: SummaryProps) {
  const s = detail.summary;
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
      <div className="action-row">
        <ReviewButtons disabled={disabled} access={access} onAction={onAction} />
        <AutoMergeBtn detail={detail} disabled={disabled} access={access} onAction={onAction} />
        <AdminMergeBtn disabled={disabled} access={access} onAction={onAction} />
      </div>
      <div className="muted small">
        {disabled
          ? 'Actions are disabled until reset.'
          : access.ownPr
            ? OWN_PR_HINT
            : detail.summary.autoMerge
              ? AUTO_MERGE_ON
              : `Auto-merge method: ${mergeMethodLabel(detail.mergeMethod)}`}
      </div>
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
        <Summary detail={p.detail} disabled={p.disabled} access={p.access} onAction={p.onAction} />
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
