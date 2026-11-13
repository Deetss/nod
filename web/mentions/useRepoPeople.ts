import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { MentionCandidate } from './mention-logic';

interface Entry {
  people: MentionCandidate[];
  cursor?: string;
  hasNext: boolean;
  loading?: Promise<void>;
}

/** Session cache, keyed by `owner/name`. A repo is fetched once, then paged on demand. */
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function pageInto(repo: string, cursor: string | undefined): Promise<void> {
  const entry = cache.get(repo) ?? { people: [], hasNext: true };
  cache.set(repo, entry);
  if (entry.loading) return entry.loading;
  entry.loading = api
    .mentionable(repo, cursor)
    .then((page) => {
      const seen = new Set(entry.people.map((p) => p.login.toLowerCase()));
      for (const p of page.people) {
        if (seen.has(p.login.toLowerCase())) continue;
        seen.add(p.login.toLowerCase());
        entry.people.push({ kind: 'person', login: p.login, avatarUrl: p.avatarUrl, reason: 'can be mentioned' });
      }
      entry.cursor = page.endCursor;
      entry.hasNext = page.hasNextPage;
    })
    .catch(() => {
      // A failed page leaves the loaded people in place. The next `@` tries again.
      entry.hasNext = false;
    })
    .finally(() => {
      entry.loading = undefined;
      notify();
    });
  return entry.loading;
}

/** Test seam: forget every cached repo. */
export function clearMentionCache(): void {
  cache.clear();
}

export interface RepoPeople {
  people: MentionCandidate[];
  /** True while the first page or a later page is in flight. */
  loading: boolean;
  hasNext: boolean;
  /** Fetches the next page, when GitHub has one. */
  loadMore: () => void;
  /** Starts the first fetch for the repo, if it has none. */
  ensure: () => void;
}

/** The repo's mentionable people from the session cache. Fetches only when `ensure` or `loadMore` is called. */
export function useRepoPeople(repo: string | undefined): RepoPeople {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const ensure = useCallback(() => {
    if (!repo || cache.has(repo)) return;
    void pageInto(repo, undefined);
  }, [repo]);

  const loadMore = useCallback(() => {
    if (!repo) return;
    const entry = cache.get(repo);
    if (!entry || entry.loading || !entry.hasNext) return;
    void pageInto(repo, entry.cursor);
  }, [repo]);

  const entry = repo ? cache.get(repo) : undefined;
  return {
    people: entry?.people ?? [],
    loading: !entry || Boolean(entry.loading),
    hasNext: entry?.hasNext ?? false,
    loadMore,
    ensure,
  };
}
