import type { IssueComment, TimelineEvent } from '../../shared/issue-types';
import { CommentItem } from '../PrThread';
import { TimelineList, TlEvent, useShown } from '../Timeline';
import { TagIcon, formatAge } from '../ui';

export type ThreadItem =
  | { kind: 'comment'; at: number; comment: IssueComment; index: number }
  | { kind: 'event'; at: number; event: TimelineEvent };

interface IssueThreadProps {
  items: ThreadItem[];
  /** Comments from this index on show NEW. */
  unseenFrom: number;
}

/** The issue conversation on the rail: label and assignee events, comments, hidden comments. */
export function IssueThread({ items, unseenFrom }: IssueThreadProps) {
  const shown = useShown();
  return (
    <TimelineList>
      {items.map((item) =>
        item.kind === 'event' ? (
          <TlEvent key={item.event.id} icon={<TagIcon />} age={`${formatAge(item.event.createdAt)} ago`}>
            {item.event.text}
          </TlEvent>
        ) : (
          <CommentItem
            key={item.comment.id}
            comment={item.comment}
            shown={shown}
            isNew={item.index >= unseenFrom}
            stepIndex={item.index}
          />
        ),
      )}
    </TimelineList>
  );
}
