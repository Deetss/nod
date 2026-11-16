import type { GroupedThread } from '../inline/group-threads';
import { ThreadView, type ThreadHost } from '../inline/ThreadView';
import { PhoneFitSheet } from './PhoneFitSheet';

interface Props {
  g: GroupedThread;
  host: ThreadHost;
  onClose: () => void;
}

/** One review thread from a diff pill: its comments with the desktop's Reply and Resolve. */
export function PhoneThreadSheet({ g, host, onClose }: Props) {
  const t = g.thread;
  const n = t.comments.length;
  return (
    <PhoneFitSheet
      title={t.line === undefined ? t.path : `${t.path}:${t.line}`}
      sub={`${n} ${n === 1 ? 'comment' : 'comments'}${g.resolved ? ' · Resolved' : ''}`}
      onClose={onClose}
      bar={
        <button type="button" className="ph-btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="ph-thread-sheet">
        <ThreadView g={g} host={host} />
      </div>
    </PhoneFitSheet>
  );
}
