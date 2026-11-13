import { useEffect, useState } from 'react';
import type { RateInfo, Stale } from '../shared/types';
import { formatClock, useClockFormat } from './time-format';
import { AlertIcon, Btn, ClockIcon, formatNum } from './ui';

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
        <div className="banner-title">{stale.message}</div>
        <div className="banner-detail">Showing cached data from {stale.cachedAt}. Nothing was lost.</div>
        <div className="banner-actions">
          <Btn keyHint="R" onClick={onRetry}>
            Retry
          </Btn>
          <Btn onClick={() => setDetails((d) => !d)}>Details</Btn>
        </div>
        {details ? <div className="banner-detail">{stale.message}</div> : null}
        <div className="banner-detail">Reads work from cache. Actions retry once the API answers.</div>
      </div>
    </div>
  );
}
