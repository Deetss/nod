import type { ReactNode, Ref } from 'react';
import type { PrSummary, SectionKey } from '../shared/types';
import type { InboxView } from './useInbox';
import { Banner } from './Banner';
import type { VisibleSection } from './inbox-utils';
import { orgLogin } from './org-settings';
import { PrRow } from './PrRow';
import { Btn, CheckIcon, Chevron, KeyCap, Legend } from './ui';

interface InboxPaneProps {
  data: InboxView | undefined;
  error: string | undefined;
  loading: boolean;
  sections: VisibleSection[];
  selectedId: string | undefined;
  filter: string;
  filterRef: Ref<HTMLInputElement>;
  listRef: Ref<HTMLDivElement>;
  narrow: boolean;
  onFilter: (v: string) => void;
  onToggle: (key: SectionKey) => void;
  onSelect: (pr: PrSummary) => void;
  onOpen: (pr: PrSummary) => void;
  onRetry: () => void;
  onShowOrg: () => void;
  /** The closed section, shown under the open sections. */
  closed?: ReactNode;
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

function LoadingPanel({ done, total }: { done?: number; total?: number }) {
  const known = done !== undefined && total !== undefined && total > 0;
  return (
    <div className="loading-panel" role="status">
      <div className="loading-title">
        Syncing {orgLogin()}{known ? `  ${done} / ${total} repos` : ''}
      </div>
      <div className="progress">
        <div style={{ width: known ? `${Math.round(((done ?? 0) / (total ?? 1)) * 100)}%` : '30%' }} />
      </div>
      <Skeleton />
      {known ? (
        <p className="muted small">
          Cached rows show first, marked &quot;cached 14:52&quot;, then refresh in place.
        </p>
      ) : null}
    </div>
  );
}

function EmptyView({ data, onShowOrg }: { data: InboxView; onShowOrg: () => void }) {
  const org = data.sections.find((s) => s.key === 'org');
  return (
    <div className="empty-view">
      <div className="chips-row">
        {data.sections.map((s) => (
          <span key={s.key} className={`sec-chip${s.key === 'org' ? ' is-active' : ''}`}>
            {s.title} <span className="count">{s.count}</span>
          </span>
        ))}
      </div>
      <div className="empty-box">
        <span className="empty-check">
          <CheckIcon size={28} />
        </span>
        <div className="empty-title">Nothing needs your review</div>
        <div className="muted">
          All caught up. Last synced {Math.max(0, Math.round((Date.now() - data.syncedAt) / 1000))}s ago.
        </div>
        {org && org.count > 0 ? (
          <>
            <Btn onClick={onShowOrg}>Show Org open ({org.count})</Btn>
            <div className="muted small">
              Press <KeyCap>g</KeyCap> <KeyCap>o</KeyCap> to jump to Org open
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function InboxPane(p: InboxPaneProps) {
  const { data } = p;
  const quiet =
    data !== undefined &&
    data.sections.every((s) => s.key === 'org' || s.count === 0) &&
    p.sections.find((s) => s.section.key === 'org')?.open === false;

  let body;
  if (!data) {
    body = p.error ? (
      <div className="banner banner-error" role="alert">
        <div className="banner-main">
          <div className="banner-title">Could not load the inbox</div>
          <div className="banner-detail">{p.error}</div>
          <div className="banner-actions">
            <Btn keyHint="R" onClick={p.onRetry}>
              Retry
            </Btn>
          </div>
        </div>
      </div>
    ) : (
      <LoadingPanel />
    );
  } else if (data.syncing && data.prs.length === 0) {
    body = <LoadingPanel done={data.syncing.done} total={data.syncing.total} />;
  } else if (quiet) {
    body = <EmptyView data={data} onShowOrg={p.onShowOrg} />;
  } else {
    body = (
      <>
        {data.stale ? <Banner stale={data.stale} rate={data.rate} onRetry={p.onRetry} /> : null}
        <div className={data.stale ? 'is-stale' : undefined}>
          {p.sections.map(({ section, prs, open }) => (
            <section key={section.key}>
              <button
                type="button"
                className="sec-h"
                aria-expanded={open}
                onClick={() => p.onToggle(section.key)}
              >
                <Chevron open={open} />
                <span className="sec-name">{section.title}</span>
                <span className="count">{section.count}</span>
              </button>
              {open
                ? prs.map((pr) => (
                    <PrRow
                      key={pr.id}
                      pr={pr}
                      selected={pr.id === p.selectedId}
                      onSelect={p.onSelect}
                      onOpen={p.onOpen}
                    />
                  ))
                : null}
            </section>
          ))}
        </div>
      </>
    );
  }

  return (
    <aside className="pane inbox-pane" aria-label="Inbox">
      <div className="pane-h">
        <span className="pane-cap">INBOX</span>
        <label className="filter">
          <input
            ref={p.filterRef}
            value={p.filter}
            placeholder="Filter"
            aria-label="Filter by repo, author or title"
            onChange={(e) => p.onFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                p.onFilter('');
                e.currentTarget.blur();
              }
            }}
          />
          <KeyCap>f</KeyCap>
        </label>
      </div>
      <div className="scroll inbox-list" role="listbox" tabIndex={0} ref={p.listRef}>
        {body}
        {data && !(data.syncing && data.prs.length === 0) ? p.closed : null}
      </div>
      <Legend />
    </aside>
  );
}
