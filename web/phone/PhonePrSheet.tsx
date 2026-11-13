import { Fragment, useRef, useState } from 'react';
import { latestChecks } from '../../shared/fix-checks';
import type { PrSummary } from '../../shared/types';
import { splitPath } from '../FilesTree';
import { PrBody } from '../Markdown';
import { MergeStatusBox } from '../MergeStatusBox';
import { PrThreadList } from '../PrThread';
import { CancelledIcon, CheckIcon, RingIcon, SkippedIcon, XIcon, formatAge } from '../ui';
import { approveDisabled } from './action-items';
import { PhoneSheet } from './PhoneSheet';
import { SheetTabs, SwipePager, useTabPager } from './SwipePager';
import type { PhonePr } from './usePhonePr';
import { repoLabel } from '../repo-label';

type PrTab = 'overview' | 'files' | 'thread' | 'checks';
const TAB_ORDER: readonly PrTab[] = ['overview', 'files', 'thread', 'checks'];

interface PrSheetProps {
  pr: PrSummary;
  viewer: string;
  data: PhonePr;
  writesOff: boolean;
  busy: boolean;
  depth: number;
  covered: boolean;
  onClose: () => void;
  onFile: (path: string) => void;
  onMore: () => void;
  onApprove: () => void;
  onComment: () => void;
  /** Set when the checks can be fixed: the checks row opens the fix sheet instead of the Checks tab. */
  onFixChecks?: () => void;
  /** Set when the PR conflicts: the conflicts row opens the fix sheet instead of GitHub. */
  onFixConflicts?: () => void;
}

type FixTaps = Pick<PrSheetProps, 'onFixChecks' | 'onFixConflicts'>;

function FileRow(p: {
  file: PhonePr['files'][number];
  onOpen: () => void;
  onViewed: (v: boolean) => void;
}) {
  const { dir, name } = splitPath(p.file.path);
  return (
    <div className="ph-file" role="button" tabIndex={0} onClick={p.onOpen}>
      <button
        type="button"
        className="ph-file-check"
        aria-label={`${p.file.viewed ? 'Unmark' : 'Mark'} ${name} viewed`}
        aria-pressed={p.file.viewed}
        onClick={(e) => {
          e.stopPropagation();
          p.onViewed(!p.file.viewed);
        }}
      >
        <span className={`ph-box${p.file.viewed ? ' is-on' : ''}`}>{p.file.viewed ? <CheckIcon size={14} /> : null}</span>
      </button>
      <span className="ph-file-text">
        <span className="ph-file-name">{name}</span>
        <span className="ph-file-path">{dir}&lrm;</span>
      </span>
      <span className="ph-file-stat">
        <span className="add">+{p.file.additions}</span> <span className="del">-{p.file.deletions}</span>
        {p.file.changedSinceReview ? <span className="ph-changed">changed</span> : null}
      </span>
    </div>
  );
}

function Overview({ data, onTab, fix }: { data: PhonePr; onTab: (tab: PrTab) => void; fix: FixTaps }) {
  const d = data.detail.data;
  if (!d) return <p className="ph-pad ph-muted">{data.detail.error ?? 'Loading…'}</p>;
  return (
    <div className="ph-pad">
      <div className="ph-status-box">
        <MergeStatusBox
          detail={d}
          fix={undefined}
          onChecks={fix.onFixChecks ?? (() => onTab('checks'))}
          onThread={() => onTab('thread')}
          onConflicts={fix.onFixConflicts}
        />
      </div>
      <p className="ph-meta">
        <span className="ph-mono">{d.headRef}</span> into <span className="ph-mono">{d.baseRef}</span>
      </p>
      <h3 className="ph-section-h">Description</h3>
      <PrBody body={d.body} bodyHtml={d.bodyHtml} className="ph-pr-md" />
      <h3 className="ph-section-h">
        Commits · {d.commitTotal}
        {d.newCommits > 0 ? ` (${d.newCommits} since your review)` : ''}
      </h3>
      {d.commits.map((c) => (
        <div className="ph-commit" key={c.sha}>
          <span className="ph-mono ph-muted">{c.sha}</span>
          <span>{c.message}</span>
        </div>
      ))}
    </div>
  );
}

function Checks({ data }: { data: PhonePr }) {
  const raw = data.detail.data?.checks;
  const checks = raw && latestChecks(raw);
  if (!checks) return <p className="ph-pad ph-muted">{data.detail.error ?? 'Loading…'}</p>;
  if (checks.length === 0) return <p className="ph-pad ph-muted">No checks reported.</p>;
  return (
    <>
      {checks.map((c) => (
        <div className="ph-check" key={c.name}>
          <span className={`ph-check-word is-${c.status}`}>
            {c.status === 'pass' ? (
              <CheckIcon />
            ) : c.status === 'fail' ? (
              <XIcon />
            ) : c.status === 'cancelled' ? (
              <CancelledIcon />
            ) : c.status === 'skipped' ? (
              <SkippedIcon />
            ) : (
              <RingIcon />
            )}
          </span>
          <span className="ph-check-name">{c.name}</span>
          <span className={`ph-check-word is-${c.status}`}>{c.status}</span>
          <span className="ph-muted">{c.duration}</span>
        </div>
      ))}
    </>
  );
}

function Thread({ data }: { data: PhonePr }) {
  if (!data.detail.data) return <p className="ph-pad ph-muted">{data.detail.error ?? 'Loading…'}</p>;
  const items = data.detail.data.thread ?? [];
  if (items.length === 0) return <p className="ph-pad ph-muted">No conversation yet.</p>;
  return (
    <div className="ph-thread">
      <PrThreadList items={items} />
    </div>
  );
}

export function PhonePrSheet(p: PrSheetProps) {
  const [tab, setTab] = useState<PrTab>('files');
  const { pr, data } = p;
  const viewed = data.files.filter((f) => f.viewed).length;
  const total = data.files.length;
  const blocked = approveDisabled({ ownPr: pr.author === p.viewer, writesOff: p.writesOff });
  const tabs: [PrTab, string][] = [
    ['overview', 'Overview'],
    ['files', total ? `Files ${viewed}/${total}` : 'Files'],
    ['thread', `Thread ${data.detail.data?.thread?.length ?? 0}`],
    ['checks', 'Checks'],
  ];
  const bodyRef = useRef<HTMLDivElement>(null);
  const pager = useTabPager(TAB_ORDER, tab, setTab, { disabled: p.covered, scroller: bodyRef });

  return (
    <PhoneSheet
      bodyRef={bodyRef}
      title={`${repoLabel(pr.repo)} #${pr.number}`}
      sub={pr.title}
      depth={p.depth}
      covered={p.covered}
      onClose={p.onClose}
      onMore={p.onMore}
      bar={
        <>
          <button type="button" className="ph-btn is-primary" disabled={!!blocked || p.busy} onClick={p.onApprove}>
            Approve
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
      <div className="ph-pad" style={{ paddingBottom: 8 }}>
        <h1 className="ph-sheet-h1">{pr.title}</h1>
        <p className="ph-meta">
          {pr.author} · opened {formatAge(pr.createdAt)}
        </p>
        <div className="ph-pills">
          <span className="ph-pill is-open">Open</span>
          {pr.isDraft ? <span className="ph-pill">Draft</span> : null}
        </div>
        {blocked && !p.writesOff ? <p className="ph-meta">{blocked}</p> : null}
      </div>
      <SheetTabs tabs={tabs} value={tab} onChange={setTab} pager={pager} sticky />
      <SwipePager
        pager={pager}
        flow
        panes={[
          <Overview
            key="overview"
            data={data}
            onTab={setTab}
            fix={{ onFixChecks: p.onFixChecks, onFixConflicts: p.onFixConflicts }}
          />,
          <Fragment key="files">
            <div className="ph-progress" aria-label="Viewed progress">
              <div style={{ width: total ? `${(viewed / total) * 100}%` : 0 }} />
            </div>
            {data.files.map((f) => (
              <FileRow key={f.path} file={f} onOpen={() => p.onFile(f.path)} onViewed={(v) => void data.toggleViewed(f.path, v)} />
            ))}
            {total === 0 ? <p className="ph-pad ph-muted">{data.detail.error ?? 'No files.'}</p> : null}
          </Fragment>,
          <Thread key="thread" data={data} />,
          <Checks key="checks" data={data} />,
        ]}
      />
    </PhoneSheet>
  );
}
