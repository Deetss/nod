/** A comment or review GitHub hides. `reason` is lowercase and trimmed, empty when GitHub gave none. */
export interface Minimized {
  reason: string;
}

/** Reads GraphQL `isMinimized` and `minimizedReason`; GitHub sends lowercase reasons, uppercase is tolerated. */
export function toMinimized(isMinimized?: boolean, reason?: string | null): Minimized | undefined {
  return isMinimized ? { reason: (reason ?? '').trim().toLowerCase() } : undefined;
}

const KNOWN = ['abuse', 'duplicate', 'off-topic', 'outdated', 'resolved', 'spam'];

const norm = (reason: string | undefined): string => (reason ?? '').trim().toLowerCase();

/** The row sentence, e.g. "This comment was marked as duplicate". Unknown reasons read "was hidden". */
export function minimizedSentence(reason: string | undefined, noun: 'comment' | 'review' = 'comment'): string {
  const r = norm(reason);
  return KNOWN.includes(r) ? `This ${noun} was marked as ${r}` : `This ${noun} was hidden`;
}

/** The pill on an expanded card: the reason word capitalised. None for an unknown reason. */
export function minimizedPill(
  reason: string | undefined,
): { label: string; tone: 'attention' | 'neutral' } | undefined {
  const r = norm(reason);
  if (!KNOWN.includes(r)) return undefined;
  return { label: r.charAt(0).toUpperCase() + r.slice(1), tone: r === 'outdated' ? 'attention' : 'neutral' };
}
