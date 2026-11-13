import { createContext } from 'react';

/** GitHub's Files changed anchor: `diff-` plus the SHA-256 hex of the file path. */
export async function fileAnchor(path: string): Promise<string> {
  const bytes = new TextEncoder().encode(path);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `diff-${hex}`;
}

/** One file in the PR's Files changed view, built from the PR's API url. */
export async function fileUrl(prUrl: string, path: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return `${prUrl}/files`;
  return `${prUrl}/files#${await fileAnchor(path)}`;
}

/** Opens a link GitHub-only in Electron (see electron/main.ts) and in a new tab in a browser. */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export interface ItemLink {
  kind: 'issue' | 'pr';
  owner: string;
  repo: string;
  number: number;
}

const ITEM_URL = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/;

/** An issue or PR URL on github.com. `repo` is the bare name; `PrSummary.repo` is `owner/name`. */
export function parseItemLink(href: string): ItemLink | undefined {
  const m = ITEM_URL.exec(href);
  if (!m) return undefined;
  return { kind: m[3] === 'pull' ? 'pr' : 'issue', owner: m[1] ?? '', repo: m[2] ?? '', number: Number(m[4]) };
}

/** True when some known item URL belongs to the link's owner and repo (case-insensitive). */
export function isKnownRepo(link: ItemLink, urls: readonly string[]): boolean {
  const prefix = `https://github.com/${link.owner}/${link.repo}/`.toLowerCase();
  return urls.some((u) => u.toLowerCase().startsWith(prefix));
}

/** The loaded item a link points at (same kind, owner, repo and number, case-insensitive), or undefined. */
export function resolveItemLink<T extends { url: string }>(link: ItemLink, items: readonly T[]): T | undefined {
  return items.find((x) => {
    const m = parseItemLink(x.url);
    return (
      m !== undefined &&
      m.kind === link.kind &&
      m.number === link.number &&
      m.owner.toLowerCase() === link.owner.toLowerCase() &&
      m.repo.toLowerCase() === link.repo.toLowerCase()
    );
  });
}

/** Opens the link inside the app and returns true, or returns false to leave it to the browser. */
export type LinkRouter = (link: ItemLink) => boolean;

export const LinkRouterContext = createContext<LinkRouter | undefined>(undefined);
