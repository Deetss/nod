import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ThreadItem } from '../inline/group-threads';
import { PhoneFitSheet, PhoneSheetBar, PhoneSheetError } from './PhoneFitSheet';

interface Props {
  repo: string;
  number: number;
  thread: ThreadItem;
  onDone: () => void;
  onCancel: () => void;
}

/** Reply to one review thread in a bottom sheet. A failed reply keeps its text for Retry. */
export function PhoneReplySheet(p: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);

  const author = p.thread.comments[0]?.author ?? 'thread';
  const where = p.thread.line === undefined ? p.thread.path : `${p.thread.path}:${p.thread.line}`;

  const send = async () => {
    if (!p.thread.threadId || busy || text.trim() === '') return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.replyToThread(p.repo, p.number, p.thread.threadId, text);
      if (res.ok) p.onDone();
      else setError(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PhoneFitSheet
      title={`Reply to ${author}`}
      sub={where}
      busy={busy}
      onClose={p.onCancel}
      bar={
        <PhoneSheetBar
          busy={busy}
          primary={error ? 'Retry' : 'Reply'}
          busyLabel="Posting…"
          disabled={text.trim() === ''}
          onCancel={p.onCancel}
          onPrimary={() => void send()}
        />
      }
    >
      <div className={`ph-fit-form${busy ? ' is-locked' : ''}`}>
        <textarea
          ref={area}
          className="ph-fix-field ph-comment-text"
          aria-label="Reply text"
          placeholder="Write a reply"
          value={text}
          readOnly={busy}
          onChange={(e) => setText(e.target.value)}
        />
        {error ? <PhoneSheetError>Not posted: {error}</PhoneSheetError> : null}
      </div>
    </PhoneFitSheet>
  );
}
