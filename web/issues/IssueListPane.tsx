import type { ReactNode, Ref } from 'react';
import type { IssueSectionKey, IssueSummary } from '../../shared/issue-types';
import { isProjectStatus } from '../../shared/project-status';
import { Banner } from '../Banner';
import { orgLogin, projectStatuses } from '../org-settings';
import { Btn, CheckIcon, Chevron, KeyCap, Legend } from '../ui';
import { Dropdown } from './Dropdown';
import { IssueRow } from './IssueRow';
import { SORT_LABELS, type IssueFilter, type IssueSectionView, type IssueSortKey } from './issue-filter';
import type { IssuesState } from './useIssues';

interface IssueListPaneProps {
  state: IssuesState;
  sections: IssueSectionView[];
  selectedId: string | undefined;
  checked: ReadonlySet<string>;
  /** Issue id to the comment count when it was dispatched to Orca. */
  dispatched?: ReadonlyMap<string, number>;
  filters: IssueFilter;
  repos: string[];
  labels: string[];
  filterRef: Ref<HTMLInputElement>;
  listRef: Ref<HTMLDivElement>;
  narrow: boolean;
  onFilters: (f: IssueFilter) => void;
  onToggle: (key: IssueSectionKey) => void;
  onSelect: (issue: IssueSummary) => void;
  onOpen: (issue: IssueSummary) => void;
  onCheck: (issue: IssueSummary) => void;
  onBulk: (kind: 'labels' | 'assign' | 'assignMe' | 'close') => void;
  onClear: () => void;
  onRetry: () => void;
  onNew: () => void;
  /** The closed section, shown under the open sections. */
  closed?: ReactNode;
}

const filtersActive = (f: IssueFilter): boolean =>
  f.text.trim() !== '' || f.repo !== '' || f.label !== '' || f.status !== '';

const GROUP_ORDER: IssueSectionKey[] = ['progress', 'bot', 'assigned', 'created', 'mentioned', 'untriaged', 'all'];
const GROUP_TITLES: Record<IssueSectionKey, string> = {
  progress: 'In progress',
  bot: 'With bot',
  assigned: 'Assigned to me',
  created: 'Created by me',
  mentioned: 'Mentioned',
  untriaged: 'Untriaged',
  all: 'All open',
};

function Skeleton() {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="sk" key={i} style={{ width: ['38%', '86%', '24%'][i], margin: '8px 14px' }} />
      ))}
    </div>
  );
}

function Loading({ done, total }: { done: number; total: number }) {
  return (
    <div role="status">
      <div className="loading-panel">
        <div className="loading-title iloading-title">
          <span>Syncing {orgLogin()}</span>
          <span className="muted">
            {done} / {total} repos
          </span>
        </div>
        <div className="progress">
          <div style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      </div>
      {GROUP_ORDER.filter((key) => key !== 'bot').slice(0, 3).map((key) => (
        <section key={key}>
          <div className="sec-h">
            <Chevron open />
            <span className="sec-name">{GROUP_TITLES[key]}</span>
            <span className="count">...</span>
          </div>
          <Skeleton />
        </section>
      ))}
      <p className="muted small iloading-note">
        Skeleton rows, no spinner. The list stays unusable until the first poll finishes, then NEW and
        UPDATED are computed.
      </p>
    </div>
  );
}

function OrgEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty-box">
      <span className="empty-check">
        <CheckIcon size={28} />
      </span>
      <div className="empty-title ititle-sm">No open issues in {orgLogin()}</div>
      <div className="muted small">Nothing assigned, created, mentioned or untriaged.</div>
      <Btn primary keyHint="n" onClick={onNew}>
        + New issue
      </Btn>
    </div>
  );
}

function FilteredEmpty({ total, onClear }: { total: number; onClear: () => void }) {
  return (
    <div className="empty-box">
      <div className="empty-title ititle-sm">No issues match these filters</div>
      <div className="muted small">
        0 of {total} open issues. Filters hide the rest.
      </div>
      <Btn keyHint="Esc" onClick={onClear}>
        Clear filters
      </Btn>
      <div className="muted small">Groups stay visible with a 0 count.</div>
    </div>
  );
}

export function IssueListPane(p: IssueListPaneProps) {
  const { data, error } = p.state;
  const bulk = p.checked.size > 0;
  const f = p.filters;
  const shown = p.sections.find((s) => s.key === 'all')?.count ?? 0;

  let body;
  if (!data) {
    body = error ? (
      <div className="banner banner-error" role="alert">
        <div className="banner-main">
          <div className="banner-title">Could not load issues</div>
          <div className="banner-detail">{error}</div>
          <div className="banner-actions">
            <Btn keyHint="R" onClick={p.onRetry}>
              Retry
            </Btn>
          </div>
        </div>
      </div>
    ) : (
      <Loading done={0} total={1} />
    );
  } else if (data.syncing) {
    body = <Loading done={data.syncing.done} total={data.syncing.total} />;
  } else if (data.issues.length === 0) {
    body = <OrgEmpty onNew={p.onNew} />;
  } else {
    body = (
      <>
        {data.stale ? <Banner stale={data.stale} rate={data.rate} onRetry={p.onRetry} /> : null}
        {data.stale ? (
          <p className="muted small istale-note">Cached rows are marked stale and actions are disabled.</p>
        ) : null}
        {filtersActive(f) && shown === 0 ? <FilteredEmpty total={data.issues.length} onClear={() => p.onFilters({ ...f, text: '', repo: '', label: '', status: '' })} /> : null}
        <div className={data.stale ? 'is-stale' : undefined}>
          {p.sections.map(({ key, title, count, issues, open }) => (
            <section key={key}>
              <button
                type="button"
                className="sec-h"
                aria-expanded={open}
                onClick={() => p.onToggle(key)}
              >
                <Chevron open={open} />
                <span className="sec-name">{title}</span>
                <span className="count">{count}</span>
              </button>
              {open
                ? issues.map((i) => (
                    <IssueRow
                      key={i.id}
                      issue={i}
                      selected={i.id === p.selectedId}
                      checked={bulk ? p.checked.has(i.id) : undefined}
                      stale={data.stale !== undefined}
                      showStatus={data.projectStatus === true}
                      orca={p.dispatched?.get(i.id) === i.commentCount}
                      onSelect={p.onSelect}
                      onOpen={p.onOpen}
                      onCheck={p.onCheck}
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
    <aside className="pane inbox-pane issue-list" aria-label="Issues">
      <div className="pane-h">
        <span className="pane-cap">ISSUES</span>
        <label className="filter">
          <input
            ref={p.filterRef}
            value={f.text}
            placeholder="Filter"
            aria-label="Filter by repo, author, title or label"
            onChange={(e) => p.onFilters({ ...f, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                p.onFilters({ ...f, text: '' });
                e.currentTarget.blur();
              }
            }}
          />
          <KeyCap>f</KeyCap>
        </label>
      </div>
      {bulk ? (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
          <strong>{p.checked.size} selected</strong>
          <Btn keyHint="l" onClick={() => p.onBulk('labels')}>
            Labels
          </Btn>
          <Btn keyHint="a" onClick={() => p.onBulk('assign')}>
            Assign
          </Btn>
          <Btn keyHint="A" onClick={() => p.onBulk('assignMe')}>
            Assign me
          </Btn>
          <Btn keyHint="x" onClick={() => p.onBulk('close')}>
            Close
          </Btn>
          <Btn keyHint="Esc" onClick={p.onClear}>
            Clear
          </Btn>
        </div>
      ) : (
        <div className="filter-row">
          <Dropdown
            label={`Repo: ${f.repo || 'all'}`}
            shortLabel="Repo"
            narrow={p.narrow}
            active={f.repo !== ''}
            value={f.repo || undefined}
            options={p.repos.map((r) => ({ value: r, label: r }))}
            clearLabel="All repos"
            onChange={(repo) => p.onFilters({ ...f, repo: repo ?? '' })}
          />
          <Dropdown
            label={`Label: ${f.label || 'any'}`}
            shortLabel="Label"
            narrow={p.narrow}
            active={f.label !== ''}
            value={f.label || undefined}
            options={p.labels.map((l) => ({ value: l, label: l }))}
            clearLabel="Any label"
            onChange={(label) => p.onFilters({ ...f, label: label ?? '' })}
          />
          {data?.projectStatus ? (
            <Dropdown
              label={`Status: ${f.status || 'any'}`}
              shortLabel="Status"
              narrow={p.narrow}
              active={f.status !== ''}
              value={f.status || undefined}
              options={projectStatuses().map((s) => ({ value: s, label: s }))}
              clearLabel="Any status"
              onChange={(status) => p.onFilters({ ...f, status: isProjectStatus(status, projectStatuses()) ? status : '' })}
            />
          ) : null}
          <Dropdown
            label={`Sort:${SORT_LABELS[f.sort]}`}
            shortLabel="Sort"
            narrow={p.narrow}
            active={false}
            value={f.sort}
            options={(Object.keys(SORT_LABELS) as IssueSortKey[]).map((s) => ({ value: s, label: SORT_LABELS[s] }))}
            onChange={(sort) => p.onFilters({ ...f, sort: (sort as IssueSortKey | undefined) ?? 'updated' })}
          />
        </div>
      )}
      <div className="scroll inbox-list" role="listbox" tabIndex={0} ref={p.listRef}>
        {body}
        {data && !data.syncing ? p.closed : null}
      </div>
      <Legend />
    </aside>
  );
}
