import { useEffect, useState } from 'react';
import { missingRequired, scopesDetail, type Connection } from '../shared/connection';
import type { RateInfo, Stale } from '../shared/types';
import { formatClock, useClockFormat } from './time-format';
import { AlertIcon, Btn, ClockIcon, formatNum, InfoIcon } from './ui';

/** No token, or one without `repo`: the list shows the token banner, and writes are off. */
export const tokenBlocks = (c: Connection | undefined): boolean => c?.state === 'none' || c?.state === 'required';

/** `GitHub token is missing repo`, with the first missing required scope. */
export const missingTitle = (c: Connection): string => `GitHub token is missing ${missingRequired(c)[0] ?? 'repo'}`;

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

interface BannerProps {
  stale: Stale;
  rate: RateInfo | undefined;
  onRetry: () => void;
}

export function Banner({ stale, rate, onRetry }: BannerProps) {
  const now = useNow(15_000);
  const [clock] = useClockFormat();
  const [details, setDetails] = useState(false);

  if (stale.kind === 'ratelimit') {
    const resetAt = stale.resetAt ? Date.parse(stale.resetAt) : now;
    const minutes = Math.max(0, Math.ceil((resetAt - now) / 60_000));
    const elapsed = Math.min(1, Math.max(0, 1 - (resetAt - now) / 3_600_000));
    return (
      <div className="banner banner-ratelimit" role="alert">
        <span style={{ color: 'var(--fgColor-attention)' }}>
          <ClockIcon size={20} />
        </span>
        <div className="banner-main">
          <div className="banner-title">
            GitHub rate limit reached ({formatNum(rate?.remaining ?? 0)} /{' '}
            {formatNum(rate?.limit ?? 5000)} left)
          </div>
          <div className="banner-detail">
            Resets at {formatClock(new Date(resetAt), clock)}, in {minutes} min. Reading from cache since{' '}
            {stale.cachedAt}.
          </div>
          <div className="banner-detail countdown">
            <span>Reset countdown {minutes} min</span>
            <div className="progress">
              <div style={{ width: `${Math.round(elapsed * 100)}%` }} />
            </div>
          </div>
          <div className="banner-actions">
            <Btn keyHint="R" disabled>
              Retry at reset
            </Btn>
            <Btn onClick={() => setDetails((d) => !d)}>Details</Btn>
          </div>
          {details ? <div className="banner-detail">{stale.message}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="banner banner-error" role="alert">
      <span style={{ color: 'var(--fgColor-danger)' }}>
        <AlertIcon size={20} />
      </span>
      <div className="banner-main">
        <div className="banner-title">Sync failed</div>
        <p className="banner-message" title={stale.message}>
          {stale.message}
        </p>
        <div className="banner-detail">Showing cached data from {stale.cachedAt}. Nothing was lost.</div>
        <div className="banner-actions">
          <Btn keyHint="R" onClick={onRetry}>
            Retry
          </Btn>
          <Btn aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            Details
          </Btn>
        </div>
        {details ? <div className="banner-detail">{failureLine(stale)}</div> : null}
        <div className="banner-detail">Reads work from cache. Actions retry once the API answers.</div>
      </div>
    </div>
  );
}

/** `HTTP 200 · InboxSync:full · 14:58`, from what the server knows about the failed call. */
export function failureLine(stale: Stale): string {
  const parts = [
    stale.status !== undefined ? `HTTP ${stale.status}` : undefined,
    stale.operation,
    stale.at,
  ].filter((x): x is string => x !== undefined);
  return parts.length > 0 ? parts.join(' · ') : 'No more detail from GitHub.';
}

/** Local HH:MM, the format the server uses for cache times. */
export const clockOf = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Under a paused or failed banner. */
export function CachedLine({ at }: { at: string }) {
  return <p className="banner-cached">Cached {at} · actions off</p>;
}

interface TokenBannerProps {
  connection: Connection;
  /** HH:MM of the saved lists. */
  cachedAt: string;
  /** Opens Settings on GitHub with focus on Check again. */
  onFix: () => void;
}

/** No token, or a token without `repo`. Replaces the generic error card; the two never stack. */
export function TokenBanner({ connection, cachedAt, onFix }: TokenBannerProps) {
  const [details, setDetails] = useState(false);
  if (connection.state === 'none') {
    return (
      <div className="banner banner-setup" role="status">
        <span className="banner-icon-accent">
          <InfoIcon size={20} />
        </span>
        <div className="banner-main">
          <div className="banner-title">Nod is not connected to GitHub</div>
          <div className="banner-detail">No GitHub token, so nothing can sync yet.</div>
          <div className="banner-actions">
            <Btn primary onClick={onFix}>
              Set up GitHub
            </Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="banner banner-error" role="alert">
      <span style={{ color: 'var(--fgColor-danger)' }}>
        <AlertIcon size={20} />
      </span>
      <div className="banner-main">
        <div className="banner-title">{missingTitle(connection)}</div>
        <div className="banner-detail">Sync is paused. Showing cached data from {cachedAt}.</div>
        <div className="banner-actions">
          <Btn primary onClick={onFix}>
            Fix in Settings
          </Btn>
          <Btn aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            Details
          </Btn>
        </div>
        {details ? <div className="banner-detail">{scopesDetail(connection)}</div> : null}
      </div>
    </div>
  );
}

/** Issues: Status is off because the token has no `project` scope. */
export function QuietNote({ onTurnOn }: { onTurnOn: () => void }) {
  return (
    <div className="quiet-note" role="status">
      <span className="quiet-note-icon">
        <InfoIcon size={16} />
      </span>
      <div className="quiet-note-text">
        <strong>Project Status is off.</strong>
        <span>Token has no project scope.</span>
      </div>
      <button type="button" className="btn quiet-note-btn" onClick={onTurnOn}>
        Turn on
      </button>
    </div>
  );
}

/** The banner a list shows: a token state first, then a sync failure. */
export function ListBanner({
  connection,
  stale,
  rate,
  syncedAt,
  onRetry,
  onFix,
}: {
  connection: Connection | undefined;
  stale: Stale | undefined;
  rate: RateInfo | undefined;
  syncedAt: number;
  onRetry: () => void;
  onFix: () => void;
}) {
  if (connection && tokenBlocks(connection)) {
    const cachedAt = clockOf(syncedAt);
    return (
      <>
        <TokenBanner connection={connection} cachedAt={cachedAt} onFix={onFix} />
        {connection.state === 'required' ? <CachedLine at={cachedAt} /> : null}
      </>
    );
  }
  if (!stale) return null;
  return (
    <>
      <Banner stale={stale} rate={rate} onRetry={onRetry} />
      {stale.kind === 'error' ? <CachedLine at={stale.cachedAt} /> : null}
    </>
  );
}
