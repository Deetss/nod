import type { ReactNode } from 'react';
import { eventSentence } from '../shared/activity';
import type { ActivityEvent, ActivityItemRef, ActivityNotice } from '../shared/activity-types';
import { activityAge } from './activity-ui';
import { IssueIcon, PrIcon } from './phone/PhoneIcons';
import { TimelineList, TlEvent } from './Timeline';
import { AlertIcon, BubbleIcon, CheckIcon, ClockIcon, CommitIcon, DiffIcon, InfoIcon, MergeIcon, RingIcon, TagIcon, XIcon } from './ui';
import { repoLabel } from './repo-label';

function Avatar({ actor }: { actor: string | undefined }) {
  return <span className="act-avatar">{(actor ?? '?').slice(0, 2)}</span>;
}

function iconFor(e: ActivityEvent, item: ActivityItemRef): { icon: ReactNode; badge?: 'danger' | 'success' } {
  switch (e.kind) {
    case 'opened':
      return { icon: item.kind === 'pr' ? <PrIcon size={16} /> : <IssueIcon size={16} /> };
    case 'commits':
      return { icon: <CommitIcon size={16} /> };
    case 'ci':
      return {
        icon: e.detail === 'fail' ? <AlertIcon size={16} /> : e.detail === 'pass' ? <CheckIcon size={16} /> : <ClockIcon size={16} />,
      };
    case 'approved':
      return { icon: <CheckIcon size={16} />, badge: 'success' };
    case 'changes':
      return { icon: <DiffIcon size={16} />, badge: 'danger' };
    case 'merged':
      return { icon: <MergeIcon size={16} /> };
    case 'closed':
      return { icon: <XIcon size={16} /> };
    case 'label-added':
    case 'label-removed':
      return { icon: <TagIcon size={16} /> };
    case 'status':
      return { icon: <RingIcon size={16} /> };
    default:
      return { icon: <Avatar actor={e.actor} /> };
  }
}

interface ActivityTimelineProps {
  item: ActivityItemRef;
  /** Newest first. */
  events: readonly ActivityEvent[];
  /** Quiet Nod lines (Orca notifications), newest first. They sit among the events by time. */
  notices?: readonly ActivityNotice[];
}

const noticeIcon = (n: ActivityNotice): ReactNode =>
  n.icon === 'alert' ? <span className="tl-notice-alert"><AlertIcon size={14} /></span> : n.icon === 'info' ? <InfoIcon size={14} /> : <BubbleIcon size={14} />;

/** One item's events on the timeline rail, newest first. */
export function ActivityTimeline({ item, events, notices = [] }: ActivityTimelineProps) {
  const rows = [
    ...events.map((e) => ({ at: Date.parse(e.at), e, n: undefined })),
    ...notices.map((n) => ({ at: Date.parse(n.at), e: undefined, n })),
  ].sort((a, b) => b.at - a.at);
  return (
    <TimelineList label={`Activity on ${repoLabel(item.repo)} #${item.number}`}>
      {rows.map(({ e, n }) => {
        if (n) {
          return (
            <TlEvent key={n.id} icon={noticeIcon(n)} age={activityAge(n.at)} quiet>
              {n.text}
            </TlEvent>
          );
        }
        if (!e) return null;
        const { icon, badge } = iconFor(e, item);
        return (
          <TlEvent key={e.id} icon={icon} badge={badge} age={activityAge(e.at)}>
            {eventSentence(e, item)}
          </TlEvent>
        );
      })}
    </TimelineList>
  );
}
