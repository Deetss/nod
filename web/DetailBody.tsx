import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { OWN_PR_HINT, type ReviewAccess } from '../shared/pr-actions';
import type { DiffMode, FileItem, PrDetail, PrThreadItem } from '../shared/types';
import { FilesTree } from './FilesTree';
import { StatusSummary } from './StatusSummary';
import { ThreadFixButton } from './CommentFix';
import type { FixControls, MenuControls } from './useFixChecks';
import type { CommentControls } from './useFixComments';
import type { FileTarget } from './goto-file';
import { PrBody } from './Markdown';
import { PrThreadList } from './PrThread';
import { Btn, CheckIcon, ExpandToggle, ExtLink, KeyCap } from './ui';
import { repoLabel } from './repo-label';

export type ActionKind = 'approve' | 'request' | 'comment' | 'merge' | 'admin' | 'ready';

export function ThreadCard({ items, fix }: { items?: PrThreadItem[]; fix?: CommentControls | undefined }) {
  if (!items?.length) return null;
  return (
    <section className="card" aria-label="Thread" id="pr-thread" tabIndex={-1}>
      <div className="card-h">
        <span>Thread</span>
        <span className="card-h-sub">{items.length}</span>
        {fix ? <ThreadFixButton fix={fix} /> : null}
      </div>
      <div className="card-body">
        <PrThreadList items={items} fix={fix} />
      </div>
    </section>
  );
}

function CommitsCard({ detail }: { detail: PrDetail }) {
  const since = detail.newCommits > 0 ? `, ${detail.newCommits} since your review` : '';
  return (
    <section className="card" aria-label="Commits">
      <div className="card-h">
        <span>Commits</span>
        <span className="card-h-sub">
          {detail.commitTotal} total{since}
        </span>
      </div>
      <div className="card-body">
        {detail.commits.map((c) => (
          <div className={`card-row commit-row${c.isNew ? '' : ' is-old'}`} key={c.sha}>
            <span className="mono muted sha">{c.sha}</span>
            <span className="ellipsis" title={c.message}>
              {c.message}
            </span>
            {c.isNew ? <span className="chip chip-new">new</span> : <span />}
            <ExtLink href={c.url} label={`Open commit ${c.sha} on GitHub`} />
          </div>
        ))}
      </div>
    </section>
  );
}

interface DescriptionProps {
  body: string;
  bodyHtml?: string;
  open: boolean;
  onToggle: () => void;
}

/** Height a description shows before `Show full description` (docs/design/pr-detail-spec.md). */
const DESC_CAP_PX = 400;

/** Open by default. A long body shows its first 400px under a fade; `open` shows all of it. */
function DescriptionCard({ body, bodyHtml, url, open, onToggle }: DescriptionProps & { url: string }) {
  const bodyId = useId();
  const inner = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setLong(el.scrollHeight > DESC_CAP_PX + 40);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bodyHtml, body]);
  const capped = long && !open;
  return (
    <section className="card desc-card" aria-label="Description">
      <div className="card-h">
        <span>Description</span>
        <a className="card-h-right desc-gh" href={url} target="_blank" rel="noopener noreferrer">
          Open on GitHub ↗
        </a>
      </div>
      <div className={`desc-body${capped ? ' is-capped' : ''}`} id={bodyId}>
        <div ref={inner}>
          <PrBody body={body} bodyHtml={bodyHtml} />
        </div>
      </div>
      {long ? (
        <div className="desc-more">
          <ExpandToggle open={open} controls={bodyId} onToggle={onToggle} />
          <KeyCap>e</KeyCap>
        </div>
      ) : null}
    </section>
  );
}

interface FilesSectionProps {
  detail: PrDetail;
  files: FileItem[];
  mode: DiffMode;
  range: string;
  commitsInRange: number;
  currentPath: string | undefined;
  scrollRequest: FileTarget | undefined;
  actionsDisabled: boolean;
  access: ReviewAccess;
  hideViewed: boolean;
  onToggleHideViewed: () => void;
  onToggleViewed: (path: string, viewed: boolean) => void;
  onOpenFile: (path: string) => void;
  onAction: (kind: ActionKind) => void;
}

function FilesSection(p: FilesSectionProps) {
  const total = p.files.length;
  const viewed = p.files.filter((f) => f.viewed).length;
  const all = total > 0 && viewed === total;
  const hasDelta = p.files.some((f) => f.changedSinceReview);
  return (
    <>
      <div className="files-h">
        <h2>Files</h2>
        <span className="files-count">
          {viewed} / {total} viewed
        </span>
        <label className="hide-viewed">
          <input type="checkbox" checked={p.hideViewed} onChange={p.onToggleHideViewed} />
          Hide viewed <KeyCap>h</KeyCap>
        </label>
      </div>
      <div className="progress files-progress" aria-label="Viewed progress">
        <div style={{ width: total ? `${(viewed / total) * 100}%` : 0 }} />
      </div>
      {p.mode === 'since' ? (
        <div className="callout callout-accent">
          <div className="mono">
            {p.range}
            {'  '}
            <span className="callout-strong">
              {p.commitsInRange > 0 ? `${p.commitsInRange} commits, ` : ''}
              {total} file{total === 1 ? '' : 's'} changed
            </span>
          </div>
          <div className="muted small">
            Unchanged files are hidden. Viewed marks reset on changed files.
          </div>
        </div>
      ) : null}
      {all ? (
        <div className="callout callout-success">
          <div className="callout-title">
            <span className="check-pass">
              <CheckIcon size={20} />
            </span>
            All {total} files viewed
          </div>
          <div className="muted">Ready to decide on {repoLabel(p.detail.summary.repo)} #{p.detail.summary.number}.</div>
          <div className="callout-actions">
            <Btn
              primary
              keyHint="a"
              disabled={p.actionsDisabled || p.access.ownPr}
              title={p.access.ownPr ? OWN_PR_HINT : undefined}
              onClick={() => p.onAction('approve')}
            >
              Approve
            </Btn>
            <Btn keyHint="c" disabled={p.actionsDisabled} onClick={() => p.onAction('comment')}>
              Comment
            </Btn>
            <Btn
              keyHint="r"
              disabled={p.actionsDisabled || p.access.ownPr}
              title={p.access.ownPr ? OWN_PR_HINT : undefined}
              onClick={() => p.onAction('request')}
            >
              Request changes
            </Btn>
          </div>
          {p.access.ownPr ? <div className="muted small">{OWN_PR_HINT}</div> : null}
          <div className="muted small">
            Next PR in Needs my review: <KeyCap>j</KeyCap>
          </div>
          <div className="muted small">Viewed state syncs to GitHub.</div>
        </div>
      ) : null}
      <FilesTree
        files={p.files}
        currentPath={p.currentPath}
        hideViewed={p.hideViewed}
        resetKey={p.detail.summary.id}
        reveal={p.scrollRequest}
        onToggleViewed={p.onToggleViewed}
        onOpenFile={p.onOpenFile}
      />
      {hasDelta && p.mode === 'all' ? (
        <div className="delta-legend muted small">Δ = changed since your last review</div>
      ) : null}
    </>
  );
}

interface DetailBodyProps extends FilesSectionProps {
  descOpen: boolean;
  onToggleDesc: () => void;
  /** Absent when no check is failing or the PR is closed. */
  fix?: FixControls | undefined;
  /** Absent unless the PR is open and conflicting. */
  resolve?: MenuControls | undefined;
  /** Absent unless the PR is open and has inline review threads. */
  comments?: CommentControls | undefined;
  /** The Orca session card or its quiet line. Sits under the description. */
  orca?: ReactNode;
}

/**
 * Status summary, description, then the cards and files tree (docs/design/pr-detail-spec.md).
 * Shared by the detail pane and the Details drawer; the review actions live outside it.
 */
export function DetailBody(p: DetailBodyProps) {
  return (
    <div className="detail-body">
      <StatusSummary key={p.detail.summary.id} detail={p.detail} own={p.access.ownPr} fix={p.fix} resolve={p.resolve} />
      <DescriptionCard
        body={p.detail.body}
        bodyHtml={p.detail.bodyHtml}
        url={p.detail.summary.url}
        open={p.descOpen}
        onToggle={p.onToggleDesc}
      />
      {p.orca}
      <ThreadCard items={p.detail.thread} fix={p.comments} />
      <CommitsCard detail={p.detail} />
      <FilesSection {...p} />
    </div>
  );
}
