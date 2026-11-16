import { useRef, useState, type KeyboardEvent } from 'react';
import { commentPlain, firstLine, type Finding } from '../shared/findings';
import type { ThreadItem } from '../shared/fix-comments';
import { DispatchAllDialog, type DispatchAllProps } from './DispatchAll';
import { BulkDialog, FindingBanner, FindingBtn, SeverityBadge, StatusLine } from './FindingParts';
import { setFindingFocus } from './finding-focus';
import { Avatar } from './issues/parts';
import { bot } from './org-settings';
import { PhoneDispatchAll } from './phone/PhoneDispatchAll';
import { PrThreadRow } from './PrThread';
import { TimelineList, useShown } from './Timeline';
import { CheckIcon } from './ui';
import { clock, type Cell, type FindingControls } from './useFindings';

const fileLine = (t: ThreadItem): string => `${t.path}${t.line ? `:${t.line}` : ''}`;
const plain = (t: ThreadItem): string => firstLine(commentPlain(t.comments[0] ?? { id: '', author: '', createdAt: '', bodyHtml: '' }), 400);

interface CardProps {
  c: FindingControls;
  /** Desktop shows key caps on the focused card; the phone never does. */
  phone: boolean;
}

function ReplyBox({ c, t, phone }: CardProps & { t: ThreadItem }) {
  const cell = c.cell(t.id);
  if (!cell.reply.open) return null;
  const busy = cell.reply.step.s === 'busy';
  return (
    <div className="finding-reply">
      <textarea
        aria-label={`Reply on ${fileLine(t)}`}
        rows={3}
        autoFocus
        value={cell.reply.text}
        readOnly={busy}
        onChange={(e) => c.draftReply(t.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            c.openReply(t.id, false);
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            c.postReply(t);
          }
        }}
      />
      <div className="finding-reply-row">
        {cell.reply.step.s === 'failed' ? <span className="finding-reply-err">{cell.reply.step.message}</span> : <span />}
        <FindingBtn label="Cancel" onClick={() => c.openReply(t.id, false)} />
        <FindingBtn label="Post reply" cap={phone ? undefined : 'Ctrl+Enter'} busy={busy} disabled={cell.reply.text.trim() === ''} onClick={() => c.postReply(t)} />
      </div>
    </div>
  );
}

/** Status lines for Hand to bot and Dispatch, with the bot's reply block once it appears. */
function Statuses({ c, f, cell }: { c: FindingControls; f: Finding; cell: Cell }) {
  const b = bot();
  const seen = c.handState(f.thread);
  const handedAt = cell.hand.s === 'done' ? cell.hand.at : seen ? Date.parse(seen.at) : undefined;
  const reply = seen?.reply;
  return (
    <>
      {cell.hand.s === 'failed' ? <StatusLine tone="err" retry={() => c.hand(f)} retryKey="b">{cell.hand.message}</StatusLine> : null}
      {cell.dispatch.s === 'failed' ? <StatusLine tone="err" retry={() => (cell.dispatch.s === 'failed' && cell.dispatch.all ? c.retryDispatchAll() : c.dispatch(f))} retryKey="s">{cell.dispatch.message}</StatusLine> : null}
      {handedAt !== undefined ? (
        <StatusLine tone="wait">{`Handed to ${b.name} ${clock(handedAt)}, waiting for reply`}</StatusLine>
      ) : null}
      {cell.dispatch.s === 'done' ? (
        <StatusLine tone="ok">{`${cell.dispatch.worktree ? 'Dispatched to' : 'Sent to'} ${cell.dispatch.note ?? 'the session'}, confirmed ${clock(cell.dispatch.at)}`}</StatusLine>
      ) : null}
      {reply ? (
        <div className="finding-botreply">
          <div className="finding-botreply-head">
            <strong>{reply.author}</strong>
            <span className="muted">{clock(Date.parse(reply.at))}</span>
          </div>
          <div className="finding-botreply-line">
            <span>{reply.line}</span>
            {reply.runUrl ? (
              <a href={reply.runUrl} target="_blank" rel="noopener noreferrer">
                Open run
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function FindingCard({ c, f, phone }: CardProps & { f: Finding }) {
  const t = f.thread;
  const cell = c.cell(t.id);
  const [more, setMore] = useState(false);
  const long = f.text.length > 280;
  const handed = cell.hand.s === 'done' || c.handState(t) !== undefined;
  return (
    <article className="finding" data-fcard={t.id} tabIndex={0} aria-label={`${f.severity} finding on ${fileLine(t)}`}>
      <div className="finding-head">
        <SeverityBadge severity={f.severity} />
        <span className="bot-chip" title={t.comments[0]?.author}>
          {t.comments[0]?.author}
        </span>
        <span className="finding-state">Unresolved</span>
      </div>
      <code className="finding-path" title={fileLine(t)}>
        {fileLine(t)}
      </code>
      <p className={`finding-body${more ? '' : ' is-clamped'}`}>{f.text}</p>
      {long ? (
        <button type="button" className="finding-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? 'Show less' : 'Show more'}
        </button>
      ) : null}
      <div className="finding-actions">
        {c.botOn ? (
          <FindingBtn
            label={handed ? 'Handed' : 'Hand to bot'}
            cap="b"
            spent={handed}
            busy={cell.hand.s === 'busy'}
            disabled={!c.writable || !t.threadId}
            onClick={() => c.hand(f)}
          />
        ) : null}
        {c.canDispatch ? (
          <FindingBtn
            label={cell.dispatch.s === 'done' ? 'Dispatched' : 'Dispatch'}
            cap="s"
            spent={cell.dispatch.s === 'done'}
            busy={cell.dispatch.s === 'busy'}
            disabled={!c.writable}
            onClick={() => c.dispatch(f)}
          />
        ) : null}
        <FindingBtn label="Reply" cap="q" disabled={!c.writable || !t.threadId} onClick={() => c.openReply(t.id, true)} />
        <FindingBtn label="Resolve" cap="x" busy={cell.resolve.s === 'busy'} disabled={!c.writable || !t.threadId} onClick={() => c.resolve(t)} />
      </div>
      {cell.resolve.s === 'failed' ? <StatusLine tone="err" retry={() => c.resolve(t)} retryKey="x">{cell.resolve.message}</StatusLine> : null}
      <Statuses c={c} f={f} cell={cell} />
      <ReplyBox c={c} t={t} phone={phone} />
    </article>
  );
}

function HumanCard({ c, t, phone }: CardProps & { t: ThreadItem }) {
  const root = t.comments[0];
  const cell = c.cell(t.id);
  return (
    <article className="finding finding-human" data-fcard={t.id} tabIndex={0} aria-label={`Thread by ${root?.author ?? 'unknown'} on ${fileLine(t)}`}>
      <div className="finding-head">
        <Avatar login={root?.author ?? ''} url={root?.avatarUrl} size={20} />
        <strong className="finding-human-name">{root?.author}</strong>
        <span className="finding-state finding-human-state">human thread, unresolved</span>
        <span className="finding-human-actions">
          <FindingBtn label="Reply" cap="q" disabled={!c.writable || !t.threadId} onClick={() => c.openReply(t.id, true)} />
          <FindingBtn label="Resolve" cap="x" busy={cell.resolve.s === 'busy'} disabled={!c.writable || !t.threadId} onClick={() => c.resolve(t)} />
        </span>
      </div>
      <p className="finding-human-line">{plain(t)}</p>
      {cell.resolve.s === 'failed' ? <StatusLine tone="err" retry={() => c.resolve(t)} retryKey="x">{cell.resolve.message}</StatusLine> : null}
      <ReplyBox c={c} t={t} phone={phone} />
    </article>
  );
}

/** A resolved thread: a collapsed row with Show, opening to the card with Reopen. */
function ResolvedRow({ c, t, severity, phone }: CardProps & { t: ThreadItem; severity?: string }) {
  const [open, setOpen] = useState(false);
  const cell = c.cell(t.id);
  const root = t.comments[0];
  const summary = ['Resolved', severity, root?.author, fileLine(t)].filter(Boolean).join(' · ');
  return (
    <div className="finding-resolved" data-fcard={t.id} tabIndex={0} aria-label={summary}>
      <div className="finding-resolved-row">
        <span className="finding-resolved-check">
          <CheckIcon size={14} />
        </span>
        <span className="finding-resolved-text" title={summary}>
          {summary}
        </span>
        <FindingBtn label={open ? 'Hide' : 'Show'} onClick={() => setOpen((o) => !o)} />
        {open ? <FindingBtn label="Reopen" cap={phone ? undefined : 'x'} busy={cell.resolve.s === 'busy'} onClick={() => c.resolve(t)} disabled={!c.writable || !t.threadId} /> : null}
      </div>
      {open ? <p className="finding-human-line">{plain(t)}</p> : null}
      {cell.resolve.s === 'failed' ? <StatusLine tone="err" retry={() => c.resolve(t)} retryKey="x">{cell.resolve.message}</StatusLine> : null}
    </div>
  );
}

const allProps = (c: FindingControls, v: NonNullable<FindingControls['dispatchAll']>): DispatchAllProps => ({
  v,
  onToggle: c.toggleDispatchAll,
  onEdit: c.editDispatchAll,
  onRebuild: c.rebuildDispatchAll,
  onCancel: c.closeDispatchAll,
  onConfirm: c.confirmDispatchAll,
});

/** The Dispatch all confirm: a dialog on desktop, a bottom sheet on the phone. */
function DispatchAll({ phone, ...p }: DispatchAllProps & { phone: boolean }) {
  return phone ? <PhoneDispatchAll {...p} /> : <DispatchAllDialog {...p} />;
}

/** Findings first (blocker, then major), then people's threads, then resolved rows, then reviews and comments. */
export function FindingList({ c, phone = false }: CardProps & { phone?: boolean }) {
  const shown = useShown();
  const list = useRef<HTMLDivElement>(null);
  const { groups, banner } = c;
  const handable = groups.open.some((f) => !!f.thread.threadId);
  const done = [
    ...groups.done.map((f) => ({ t: f.thread, sev: f.severity === 'blocker' ? 'Blocker' : 'Major' })),
    ...groups.humansDone.map((t) => ({ t, sev: undefined as string | undefined })),
  ];

  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if ((e.target as HTMLElement).closest('.finding-bulk')) return;
    if (e.key === 'H' && c.botOn && handable) {
      e.preventDefault();
      e.stopPropagation();
      c.openBulk();
      return;
    }
    if (e.key === 'S' && c.canDispatchAll) {
      e.preventDefault();
      e.stopPropagation();
      c.openDispatchAll();
      return;
    }
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-fcard]');
    if (!card) return;
    const id = card.dataset.fcard ?? '';
    const finding = groups.open.find((f) => f.thread.id === id);
    const thread = finding?.thread ?? groups.humans.find((t) => t.id === id) ?? groups.done.find((f) => f.thread.id === id)?.thread ?? groups.humansDone.find((t) => t.id === id);
    const run: Record<string, (() => void) | undefined> = {
      j: () => step(card, 1),
      k: () => step(card, -1),
      b: finding && c.botOn ? () => c.hand(finding) : undefined,
      s: finding && c.canDispatch ? () => c.dispatch(finding) : undefined,
      q: thread && !thread.resolved ? () => c.openReply(id, true) : undefined,
      x: thread ? () => c.resolve(thread) : undefined,
    };
    const act = run[e.key];
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();
    act();
  };

  const step = (from: HTMLElement, dir: 1 | -1): void => {
    const all = [...(list.current?.querySelectorAll<HTMLElement>('[data-fcard]') ?? [])];
    all[all.indexOf(from) + dir]?.focus();
  };

  return (
    <div
      className="finding-wrap"
      onKeyDown={onKey}
      onFocus={() => setFindingFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFindingFocus(false);
      }}
    >
      <FindingBanner
        banner={banner}
        botOn={c.botOn}
        canHand={handable && c.writable}
        cap={phone ? undefined : 'H'}
        onHandAll={c.openBulk}
        canDispatch={c.canDispatchAll}
        onDispatchAll={c.openDispatchAll}
        dispatchCap={phone ? undefined : 'S'}
        sent={c.sentCount}
      />
      <div className="finding-list" ref={list}>
        {groups.open.map((f) => (
          <FindingCard key={f.thread.id} c={c} f={f} phone={phone} />
        ))}
        {groups.humans.map((t) => (
          <HumanCard key={t.id} c={c} t={t} phone={phone} />
        ))}
        {done.map(({ t, sev }) => (
          <ResolvedRow key={t.id} c={c} t={t} severity={sev} phone={phone} />
        ))}
        {groups.other.length > 0 ? (
          <div className="finding-other">
            <TimelineList>
              {groups.other.map((item) => (
                <PrThreadRow key={`${item.kind}-${item.kind === 'comment' ? item.comment.id : item.id}`} item={item} shown={shown} />
              ))}
            </TimelineList>
          </div>
        ) : null}
      </div>
      {c.bulk ? (
        <BulkDialog rows={c.bulk.rows} busy={c.bulk.busy} phone={phone} onToggle={c.toggleBulk} onCancel={c.closeBulk} onConfirm={c.confirmBulk} />
      ) : null}
      {c.dispatchAll ? <DispatchAll phone={phone} {...allProps(c, c.dispatchAll)} /> : null}
    </div>
  );
}
