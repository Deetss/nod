import type { ReactNode } from 'react';
import type { IssueComment } from '../shared/issue-types';
import type { PrThreadItem, ReviewVerdict } from '../shared/types';
import { Avatar } from './issues/parts';
import { CommentFixButton } from './CommentFix';
import { Html } from './Markdown';
import {
  CardArticle,
  HiddenItem,
  TimelineList,
  TlCard,
  TlEvent,
  TlPill,
  hiddenCardId,
  reasonPill,
  useShown,
  type Pill,
} from './Timeline';
import { CheckIcon, DiffIcon, formatAge } from './ui';
import type { CommentControls } from './useFixComments';

export const VERDICT_WORDS: Record<ReviewVerdict, string> = {
  changes: 'requested changes',
  approved: 'approved',
  commented: 'commented',
};

/** Verb in a review card header; a review that only comments reads "reviewed". */
const REVIEW_VERBS: Record<ReviewVerdict, string> = {
  changes: 'requested changes',
  approved: 'approved',
  commented: 'reviewed',
};

const VERDICT_PILLS: Partial<Record<ReviewVerdict, Pill>> = {
  changes: { label: 'Changes requested', tone: 'danger' },
  approved: { label: 'Approved', tone: 'success' },
};

export function threadLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`;
}

type Shown = ReturnType<typeof useShown>;

/** One comment: a card with an avatar on the rail, or a hidden row that opens to the card. */
export function CommentItem({
  comment,
  shown,
  isNew,
  stepIndex,
  verb = 'commented',
  tools,
}: {
  comment: IssueComment;
  shown: Shown;
  /** Unseen since the viewer looked; the badge shows on the card, never on a collapsed row. */
  isNew?: boolean;
  /** Position for `]` and `[` stepping. */
  stepIndex?: number;
  /** The header verb. `null` leaves it out, as on inline review cards. */
  verb?: string | null;
  /** A control at the right end of the card header. */
  tools?: ReactNode;
}) {
  const age = `${formatAge(comment.createdAt)} ago`;
  if (!comment.minimized) {
    return (
      <TlCard
        avatar={<Avatar login={comment.author} url={comment.avatarUrl} size={32} />}
        author={comment.author}
        verb={verb}
        age={age}
        tools={tools}
        isNew={isNew}
        stepIndex={stepIndex}
      >
        <Html html={comment.bodyHtml} className="idetail-md" />
      </TlCard>
    );
  }
  const { reason } = comment.minimized;
  return (
    <HiddenItem
      id={comment.id}
      noun="comment"
      reason={reason}
      open={shown.has(comment.id)}
      onToggle={() => shown.toggle(comment.id)}
      stepIndex={stepIndex}
    >
      <CardArticle
        id={hiddenCardId(comment.id)}
        author={comment.author}
        verb={verb}
        pill={reasonPill(reason)}
        age={age}
        isNew={isNew}
        stepIndex={stepIndex}
      >
        <Html html={comment.bodyHtml} className="idetail-md" />
      </CardArticle>
    </HiddenItem>
  );
}

type ReviewItem = Extract<PrThreadItem, { kind: 'review' }>;

function ReviewEntry({ item, shown }: { item: ReviewItem; shown: Shown }) {
  const age = `${formatAge(item.at)} ago`;
  const pill = VERDICT_PILLS[item.verdict];
  const badge = item.verdict === 'changes' ? 'danger' : item.verdict === 'approved' ? 'success' : undefined;
  const cardId = `tl-${item.id}`;
  if (item.minimized) {
    const { reason } = item.minimized;
    return (
      <HiddenItem
        id={item.id}
        noun="review"
        reason={reason}
        open={shown.has(item.id)}
        onToggle={() => shown.toggle(item.id)}
      >
        <CardArticle
          id={hiddenCardId(item.id)}
          author={item.actor}
          verb={REVIEW_VERBS[item.verdict]}
          pill={reasonPill(reason)}
          age={age}
        >
          {item.bodyHtml ? <Html html={item.bodyHtml} className="idetail-md" /> : null}
        </CardArticle>
      </HiddenItem>
    );
  }
  if (!item.bodyHtml) {
    return (
      <TlEvent
        id={cardId}
        icon={item.verdict === 'changes' ? <DiffIcon /> : item.verdict === 'approved' ? <CheckIcon /> : null}
        badge={badge}
        age={age}
      >
        <strong>{item.actor}</strong> {REVIEW_VERBS[item.verdict]}
        {pill ? <TlPill pill={pill} /> : null}
      </TlEvent>
    );
  }
  return (
    <TlCard
      id={cardId}
      tabIndex={-1}
      avatar={
        item.verdict === 'changes' ? (
          <DiffIcon />
        ) : item.verdict === 'approved' ? (
          <CheckIcon />
        ) : (
          <Avatar login={item.actor} size={32} />
        )
      }
      badge={badge}
      author={item.actor}
      verb={REVIEW_VERBS[item.verdict]}
      pill={pill}
      age={age}
    >
      <Html html={item.bodyHtml} className="idetail-md" />
    </TlCard>
  );
}

/** One PR conversation entry on the rail. */
export function PrThreadRow({ item, shown, fix }: { item: PrThreadItem; shown: Shown; fix?: CommentControls }) {
  if (item.kind === 'comment') return <CommentItem comment={item.comment} shown={shown} />;
  if (item.kind === 'review') return <ReviewEntry item={item} shown={shown} />;
  return (
    <>
      <TlEvent icon={<span className="tl-mark" />}>
        <code className="tl-code">
          {item.path}
          {item.line ? `:${item.line}` : ''}
        </code>
        {item.resolved ? <TlPill pill={{ label: 'Resolved', tone: 'success' }} /> : null}
      </TlEvent>
      {item.comments.map((c, i) => (
        <CommentItem
          key={c.id}
          comment={c}
          shown={shown}
          verb={null}
          tools={i === 0 && fix?.fixableIds.has(item.id) ? <CommentFixButton fix={fix} thread={item} /> : undefined}
        />
      ))}
    </>
  );
}

export function PrThreadList({ items, fix }: { items: PrThreadItem[]; fix?: CommentControls }) {
  const shown = useShown();
  return (
    <TimelineList>
      {items.map((item) => (
        <PrThreadRow
          key={`${item.kind}-${item.kind === 'comment' ? item.comment.id : item.id}`}
          item={item}
          shown={shown}
          fix={fix}
        />
      ))}
    </TimelineList>
  );
}
