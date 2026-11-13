import { useId, useState } from 'react';
import { buildSummary, type Segment, type SegmentKey, type Verdict } from '../shared/status-summary';
import type { PrDetail } from '../shared/types';
import { ChecksList, focusThread, ResolveStrip } from './MergeStatusBox';
import { AlertIcon, CheckIcon, ClockIcon, MergeIcon, XIcon } from './ui';
import type { FixControls, MenuControls } from './useFixChecks';

function VerdictIcon({ v }: { v: Verdict }) {
  if (v.glyph === 'ring') {
    return (
      <span className="sum-icon sum-icon-ring" aria-hidden="true">
        <span className="sum-icon-dot" />
      </span>
    );
  }
  const glyph =
    v.glyph === 'check' ? <CheckIcon /> : v.glyph === 'x' ? <XIcon /> : v.glyph === 'merge' ? <MergeIcon /> : v.glyph === 'clock' ? <ClockIcon /> : <AlertIcon />;
  return (
    <span className={`sum-icon sum-tone-${v.tone}`} aria-hidden="true">
      {glyph}
    </span>
  );
}

function SegmentButton({ s, open, controls, onClick }: { s: Segment; open: boolean; controls?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`sum-seg${open ? ' is-open' : ''}`}
      aria-expanded={controls ? open : undefined}
      aria-controls={controls}
      onClick={onClick}
    >
      <span className="sum-seg-top">
        <span className="sum-seg-label">{s.label}</span>
        <span className="sum-seg-value">{s.value}</span>
      </span>
      <span className="sum-bar" aria-hidden="true">
        <span className={`sum-bar-fill sum-bar-${s.tone}`} style={{ width: `${Math.round(s.fill * 100)}%` }} />
      </span>
    </button>
  );
}

interface StatusSummaryProps {
  detail: PrDetail;
  own: boolean;
  fix: FixControls | undefined;
  resolve?: MenuControls | undefined;
}

/**
 * GitHub-style status summary (docs/design/pr-detail-spec.md): one verdict line over Checks,
 * Threads and Approvals bars. Checks and Conflicts open their detail below; Threads and Approvals
 * jump to the thread.
 */
export function StatusSummary({ detail, own, fix, resolve }: StatusSummaryProps) {
  const sum = buildSummary(detail, own);
  const detailId = useId();
  // The caller keys this by PR, so each PR starts from its own first-open segment.
  const [open, setOpen] = useState<SegmentKey | undefined>(sum.openFirst);

  const click = (key: SegmentKey) => {
    if (key === 'checks' || key === 'conflicts') setOpen((o) => (o === key ? undefined : key));
    else focusThread(detail, detail.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : 'any');
  };

  return (
    <section className="sum" aria-label="Merge status">
      <div className="sum-verdict">
        <VerdictIcon v={sum.verdict} />
        <span className="sum-text">
          <span className="sum-headline">{sum.verdict.headline}</span>
          {sum.verdict.sub ? <span className="sum-sub">{sum.verdict.sub}</span> : null}
        </span>
      </div>
      {sum.segments.length > 0 ? (
        <div className="sum-segs">
          {sum.segments.map((s) => (
            <SegmentButton
              key={s.key}
              s={s}
              open={open === s.key}
              {...(s.key === 'checks' || s.key === 'conflicts' ? { controls: detailId } : {})}
              onClick={() => click(s.key)}
            />
          ))}
        </div>
      ) : null}
      {open === 'checks' && detail.checks.length > 0 ? <ChecksList checks={detail.checks} fix={fix} id={detailId} /> : null}
      {open === 'conflicts' && resolve ? (
        <div id={detailId}>
          <ResolveStrip resolve={resolve} url={detail.summary.url} />
        </div>
      ) : null}
    </section>
  );
}
