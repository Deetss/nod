import { useState, type ReactNode } from 'react';
import type { Connection } from '../../shared/connection';
import type { Stale } from '../../shared/types';
import { failureLine, missingTitle } from '../Banner';
import { AlertIcon, InfoIcon } from '../ui';
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

interface ErrorBannerProps {
  title: string;
  body: ReactNode;
  /** A muted line under the body. */
  note?: string;
  /** Accent tone for first run, where nothing failed yet. */
  setup?: boolean;
  icon?: ReactNode;
  actions: ReactNode;
}

export function ErrorBanner({ title, body, note, setup, icon, actions }: ErrorBannerProps) {
  return (
    <div className={`ph-error${setup ? ' is-setup' : ''}`} role={setup ? 'status' : 'alert'}>
      <span className="ph-error-icon">{icon ?? <CrossCircleIcon size={32} />}</span>
      <div className="ph-error-text">
        <h2 className="ph-error-title">{title}</h2>
        <p className="ph-error-body" title={typeof body === 'string' ? body : undefined}>
          {body}
        </p>
        {note ? <p className="ph-error-note">{note}</p> : null}
        <div className="ph-error-actions">{actions}</div>
      </div>
    </div>
  );
}

/** The phone cannot reach the Nod server. */
export function ReachBanner({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <ErrorBanner
      title="Can't reach Nod"
      body={
        <>
          Check that Tailscale is connected on this phone, then retry.
          <span className="ph-error-detail"> {detail}</span>
        </>
      }
      actions={
        <>
          <button type="button" className="ph-btn" onClick={onRetry}>
            Retry
          </button>
          <a className="ph-btn" href="tailscale://">
            Open Tailscale
          </a>
        </>
      }
    />
  );
}

/** A sync failed: GitHub's message once, the cache time, and the failed call under Details. */
export function SyncFailedBanner({ stale, onRetry }: { stale: Stale; onRetry: () => void }) {
  const [details, setDetails] = useState(false);
  return (
    <ErrorBanner
      title="Sync failed"
      body={stale.message}
      note={`Showing cached data from ${stale.cachedAt}. Nothing was lost.${details ? ` ${failureLine(stale)}.` : ''}`}
      icon={<AlertIcon size={32} />}
      actions={
        <>
          <button type="button" className="ph-btn" onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="ph-btn" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            Details
          </button>
        </>
      }
    />
  );
}

/** No token, or a token without `repo`. How to fix opens the GitHub connection sheet. */
export function TokenBannerPhone({ connection, cachedAt, onFix }: { connection: Connection; cachedAt: string; onFix: () => void }) {
  const none = connection.state === 'none';
  return (
    <ErrorBanner
      setup={none}
      icon={none ? <InfoIcon size={32} /> : <AlertIcon size={32} />}
      title={none ? 'Nod is not connected to GitHub' : missingTitle(connection)}
      body={none ? 'The computer running Nod has no GitHub token.' : `Sync is paused. Showing cached data from ${cachedAt}.`}
      actions={
        <button type="button" className="ph-btn is-primary" onClick={onFix}>
          How to fix
        </button>
      }
    />
  );
}

/** Project Status is off because the token has no `project` scope. */
export function PhoneQuietNote({ onTurnOn }: { onTurnOn: () => void }) {
  return (
    <div className="quiet-note ph-quiet-note" role="status">
      <span className="quiet-note-icon">
        <InfoIcon size={16} />
      </span>
      <div className="quiet-note-text">
        <strong>Project Status is off.</strong>
        <span>Token has no project scope.</span>
      </div>
      <button type="button" className="ph-btn quiet-note-btn" onClick={onTurnOn}>
        Turn on
      </button>
    </div>
  );
}
