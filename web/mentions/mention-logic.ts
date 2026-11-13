/** Pure helpers for the @mention strip: finding the trigger, filtering, ordering and inserting. */

export type MentionKind = 'person' | 'team';

export interface MentionCandidate {
  kind: MentionKind;
  /** A login for people, `org/team` for teams. */
  login: string;
  avatarUrl?: string;
  /** Reason text shown under the row, e.g. `author`, `commenter`, `team you are in`. */
  reason: string;
}

export interface MentionTrigger {
  /** Index of the `@` in the text. */
  start: number;
  /** Text typed after the `@`, up to the caret. */
  query: string;
}

/**
 * The `@` trigger that the caret is inside, if any. The `@` must start a word (line start,
 * after whitespace or an opening bracket), and only login characters may sit between it and the caret.
 */
export function mentionTrigger(text: string, caret: number): MentionTrigger | undefined {
  const before = text.slice(0, caret);
  const m = /(^|[\s([])@([A-Za-z0-9_./-]*)$/.exec(before);
  if (!m) return undefined;
  const query = m[2] ?? '';
  return { start: before.length - query.length - 1, query };
}

/** Candidates whose login or reason matches the query, in their original order, without duplicates. */
export function filterCandidates(list: readonly MentionCandidate[], query: string): MentionCandidate[] {
  const q = query.toLowerCase();
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const c of list) {
    const key = c.login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (q === '' || key.includes(q)) out.push(c);
  }
  return out;
}

/** Merges ranked sources into one list. The first source to name a login keeps it. */
export function rankCandidates(...sources: readonly (readonly MentionCandidate[])[]): MentionCandidate[] {
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const list of sources) {
    for (const c of list) {
      const key = c.login.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/** Replaces the typed `@partial` (from `start` to the caret) with `@login `, and returns the new text and caret. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  login: string,
): { text: string; caret: number } {
  const insert = `@${login} `;
  return { text: text.slice(0, start) + insert + text.slice(caret), caret: start + insert.length };
}

/**
 * People already on the screen, in the spec's order: author, requested reviewers, assignees,
 * then commenters. Duplicates keep their highest rank.
 */
export function screenPeople(
  author: string | undefined,
  requested: readonly string[],
  assignees: readonly string[],
  commenters: readonly string[],
): MentionCandidate[] {
  const row = (login: string, reason: string): MentionCandidate => ({ kind: 'person', login, reason });
  return rankCandidates(
    author ? [row(author, 'author')] : [],
    requested.map((l) => row(l, 'reviewer requested')),
    assignees.map((l) => row(l, 'assignee')),
    commenters.map((l) => row(l, 'commenter')),
  );
}
