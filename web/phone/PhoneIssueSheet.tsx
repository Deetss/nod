import { useId, useRef, useState } from 'react';
import type { IssueDetail, IssueSummary, ParentIssue, SubIssue } from '../../shared/issue-types';
import { PhoneParentRow, PhoneSubIssuesSection } from './PhoneSubIssues';
import { IssueThread, type ThreadItem } from '../issues/IssueThread';
import { StatusChip } from '../issues/parts';
import type { IssuePickerField } from './picker-items';
import { AssigneesValue, FieldRow, LabelsValue, spokenList } from './PhonePickerParts';
import { Html } from '../Markdown';
import { ExpandToggle, formatAge } from '../ui';
import type { Remote } from '../useRemote';
import { statusOption } from '../org-settings';
import { issuePrimary } from './action-items';
import { PhoneSheet } from './PhoneSheet';
import { SheetTabs, SwipePager, useTabPager } from './SwipePager';
import { repoLabel } from '../repo-label';
import { headerCheck, trimLine, type PhoneBotState } from './bot-check-phone';

type IssueTab = 'details' | 'thread';
const TAB_ORDER: readonly IssueTab[] = ['details', 'thread'];

interface IssueSheetProps {
  issue: IssueSummary;
  viewer: string;
  /** The org project's Status options resolved. */
  projectStatus: boolean;
  detail: Remote<IssueDetail>;
  /** The bot check and Trim state for this issue. */
  bot?: PhoneBotState;
  writesOff: boolean;
  busy: boolean;
  depth: number;
  covered: boolean;
  onClose: () => void;
  onMore: () => void;
  onPrimary: (id: ReturnType<typeof issuePrimary>['id']) => void;
  onComment: () => void;
  /** Opens the picker for a Details row. */
  onPick: (field: 'labels' | 'assignees' | 'milestone') => void;
  sub: SubIssueHandlers;
}

interface SubIssueHandlers {
  onOpen: (child: SubIssue) => void;
  onLong: (child: SubIssue) => void;
  onCreate: () => void;
  onParent: (parent: ParentIssue) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ph-kv">
      <span className="ph-kv-key">{label}</span>
      <span className="ph-kv-val">{children}</span>
    </div>
  );
}

function Details({
  issue,
  detail,
  projectStatus,
  writesOff,
  onPick,
  sub,
}: {
  issue: IssueSummary;
  detail: Remote<IssueDetail>;
  projectStatus: boolean;
  writesOff: boolean;
  onPick: (field: IssuePickerField) => void;
  sub: SubIssueHandlers;
}) {
  const [full, setFull] = useState(false);
  const summaryId = useId();
  const d = detail.data;
  const milestone = d?.milestone;
  const open = issue.state === 'open';
  return (
    <>
      <Row label="State">
        <span className={`ph-pill ${open ? 'is-open' : 'is-done'}`}>{open ? 'Open' : 'Closed'}</span>
      </Row>
      {projectStatus ? (
        <Row label="Status">
          <StatusChip status={issue.status ?? statusOption('backlog')} />
        </Row>
      ) : null}
      <PhoneSubIssuesSection
        parentRepo={issue.repo}
        subs={d?.subIssues}
        writesOff={writesOff}
        onOpen={sub.onOpen}
        onLong={sub.onLong}
        onCreate={sub.onCreate}
      />
      <FieldRow label="Assignees" spoken={spokenList(issue.assignees)} off={writesOff} onOpen={() => onPick('assignees')}>
        <AssigneesValue logins={issue.assignees} />
      </FieldRow>
      <FieldRow label="Labels" spoken={spokenList(issue.labels.map((l) => l.name))} off={writesOff} onOpen={() => onPick('labels')}>
        <LabelsValue labels={issue.labels} />
      </FieldRow>
      <FieldRow
        label="Milestone"
        spoken={milestone ?? 'none'}
        off={writesOff || !d}
        onOpen={() => onPick('milestone')}
      >
        {d ? milestone ?? <span className="ph-muted">None</span> : <span className="ph-muted">Loading...</span>}
      </FieldRow>
      <div className="ph-pad">
        <h3 className="ph-section-h" style={{ marginTop: 0 }}>Summary</h3>
        {d ? (
          <>
            <div id={summaryId}>
              <Html html={d.bodyHtml} className={full ? '' : 'ph-clamp'} />
            </div>
            <ExpandToggle open={full} controls={summaryId} onToggle={() => setFull((f) => !f)} />
          </>
        ) : (
          <p className="ph-muted">{detail.error ?? 'Loading…'}</p>
        )}
      </div>
    </>
  );
}

function Thread({ detail }: { detail: Remote<IssueDetail> }) {
  const d = detail.data;
  if (!d) return <p className="ph-pad ph-muted">{detail.error ?? 'Loading…'}</p>;
  if (d.comments.length === 0) return <p className="ph-pad ph-muted">No comments yet.</p>;
  const items: ThreadItem[] = d.comments.map((comment, index) => ({
    kind: 'comment',
    at: Date.parse(comment.createdAt),
    comment,
    index,
  }));
  return (
    <div className="ph-thread">
      <IssueThread items={items} unseenFrom={items.length} />
    </div>
  );
}

export function PhoneIssueSheet(p: IssueSheetProps) {
  const [tab, setTab] = useState<IssueTab>('details');
  const { issue } = p;
  const chip = p.bot ? headerCheck(p.bot) : undefined;
  const trimNote = p.bot ? trimLine(p.bot) : undefined;
  const primary = issuePrimary({
    issueOpen: issue.state === 'open',
    assignedToViewer: issue.assignees.includes(p.viewer),
    projectStatus: p.projectStatus,
    status: issue.status,
  });
  const open = issue.state === 'open';
  const parent = p.detail.data?.parent;
  const bodyRef = useRef<HTMLDivElement>(null);
  const pager = useTabPager(TAB_ORDER, tab, setTab, { disabled: p.covered, scroller: bodyRef });

  return (
    <PhoneSheet
      bodyRef={bodyRef}
      title={`${repoLabel(issue.repo)} #${issue.number}`}
      sub={issue.title}
      depth={p.depth}
      covered={p.covered}
      onClose={p.onClose}
      onMore={p.onMore}
      pinned={
        <>
          {parent ? <PhoneParentRow parent={parent} onOpen={() => p.sub.onParent(parent)} /> : null}
          <SheetTabs
            tabs={[
              ['details', 'Details'],
              ['thread', `Thread ${issue.commentCount}`],
            ]}
            value={tab}
            onChange={setTab}
            pager={pager}
          />
        </>
      }
      bar={
        <>
          <button
            type="button"
            className={`ph-btn is-primary${p.writesOff ? ' is-off' : ''}`}
            disabled={p.writesOff || p.busy}
            onClick={() => p.onPrimary(primary.id)}
          >
            {primary.label}
          </button>
          <button type="button" className={`ph-btn${p.writesOff ? ' is-off' : ''}`} disabled={p.writesOff} onClick={p.onComment}>
            Comment
          </button>
          <button type="button" className="ph-btn is-narrow" onClick={p.onMore}>
            More
          </button>
        </>
      }
    >
      <div className="ph-pad" style={{ paddingBottom: 0 }}>
        <h1 className="ph-sheet-h1">{issue.title}</h1>
        <p className="ph-meta">
          {repoLabel(issue.repo)} <span className="row-num">#{issue.number}</span> · opened {formatAge(issue.createdAt)} by{' '}
          {issue.author}
        </p>
        {!open ? (
          <div className="ph-pills">
            <span className="ph-pill is-done">Closed</span>
          </div>
        ) : null}
        {chip ? (
          <div className="ph-pills ph-check-row">
            {chip.kind === 'verdict' ? (
              <a className={`chip bot-chip bot-chip-${chip.verdict} ph-check-chip`} href={`#${chip.commentId}`}>
                <span aria-hidden="true">{chip.glyph}</span> {chip.text}
              </a>
            ) : chip.kind === 'checking' ? (
              <span className="chip bot-chip ph-check-chip">
                <span className="spinner" aria-hidden="true" /> {chip.text}
              </span>
            ) : chip.kind === 'failed' ? (
              <span className="ph-check-text ph-check-danger" role="alert">
                {chip.text}
              </span>
            ) : (
              <span className="ph-check-text ph-muted">{chip.text}</span>
            )}
            {trimNote ? (
              <p className={`ph-check-trim ph-check-${trimNote.tone}`} role={trimNote.tone === 'danger' ? 'alert' : 'status'}>
                {trimNote.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <SwipePager
        pager={pager}
        flow
        panes={[
          <Details
            key="details"
            issue={issue}
            detail={p.detail}
            projectStatus={p.projectStatus}
            writesOff={p.writesOff}
            onPick={p.onPick}
            sub={p.sub}
          />,
          <Thread key="thread" detail={p.detail} />,
        ]}
      />
    </PhoneSheet>
  );
}
