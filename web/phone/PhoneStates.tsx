import { CheckCircleIcon, CrossCircleIcon } from './PhoneIcons';

export function LoadingLine({ label = 'Loading from GitHub…' }: { label?: string }) {
  return (
    <div className="ph-loadline" role="status">
      <span>{label}</span>
      <span className="ph-bar" aria-hidden="true" />
    </div>
  );
}

/** Three skeleton rows per section, the same height as a two line PR row. */
export function SkeletonSections({ titles }: { titles: string[] }) {
  return (
    <>
      {titles.map((t) => (
        <div key={t} aria-hidden="true">
          <div className="ph-section is-static">
            <span>{t}</span>
          </div>
          {[0, 1, 2].map((i) => (
            <div className="ph-skel" key={i}>
              <span className="ph-sk" style={{ width: '88%' }} />
              <span className="ph-sk" style={{ width: '52%' }} />
              <span className="ph-sk" style={{ width: '70%' }} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function EmptyBlock({
  title,
  body,
  syncLine,
  refreshing,
  onRefresh,
}: {
  title: string;
  body: string;
  syncLine: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="ph-empty">
      <span className="ph-empty-ring">
        <CheckCircleIcon size={56} />
      </span>
      <h2 className="ph-empty-title">{title}</h2>
      <p className="ph-empty-body">{body}</p>
      <p className="ph-empty-sync">{syncLine}</p>
      <button type="button" className="ph-btn" disabled={refreshing} onClick={onRefresh}>
        {refreshing ? <span className="ph-spinner" aria-hidden="true" /> : null}
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

export function ErrorBanner({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="ph-error" role="alert">
      <span className="ph-error-icon">
        <CrossCircleIcon size={32} />
      </span>
      <div className="ph-error-text">
        <h2 className="ph-error-title">Can&apos;t reach Nod</h2>
        <p className="ph-error-body">
          Check that Tailscale is connected on this phone, then retry.
          <span className="ph-error-detail"> {detail}</span>
        </p>
        <div className="ph-error-actions">
          <button type="button" className="ph-btn" onClick={onRetry}>
            Retry
          </button>
          <a className="ph-btn" href="tailscale://">
            Open Tailscale
          </a>
        </div>
      </div>
    </div>
  );
}
