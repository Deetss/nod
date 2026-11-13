import { useEffect, useRef, useState } from 'react';

/** How long a PR or issue must stay on screen before it counts as seen. */
export const SEEN_DWELL_MS = 1500;

/** What the hook watches: a PR has `headSha`, an issue does not. */
interface Viewable {
  id: string;
  updatedAt?: string;
  headSha?: string;
}

/**
 * Marks `item` seen once it has stayed on screen for SEEN_DWELL_MS. Pass undefined when
 * no detail is showing. Changing or clearing the item cancels the pending mark. A change
 * to updatedAt or headSha while the item stays on screen restarts the dwell, so it is marked
 * again. Nothing is marked while the document is hidden.
 */
export function useSeenOnView<T extends Viewable>(item: T | undefined, onSeen: (item: T) => void): void {
  const latest = useRef(item);
  latest.current = item;
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const id = item?.id;
  const updatedAt = item?.updatedAt;
  const headSha = item?.headSha;
  useEffect(() => {
    if (!id || !visible) return;
    const t = setTimeout(() => {
      const cur = latest.current;
      if (!cur || cur.id !== id || document.visibilityState !== 'visible') return;
      onSeenRef.current(cur);
    }, SEEN_DWELL_MS);
    return () => clearTimeout(t);
  }, [id, updatedAt, headSha, visible]);
}
