import type { GroupedThread, ThreadItem } from './group-threads';

/** What a thread card shows: the full conversation, or one collapsed row when resolved. */
export type ThreadMode = 'open' | 'resolved-collapsed' | 'resolved-expanded';

/** The line or range label, e.g. `line 41` or `lines 40 to 42`. */
export function threadLabel(t: Pick<ThreadItem, 'line' | 'startLine'>): string {
  if (t.line === undefined) return 'file';
  if (t.startLine !== undefined && t.startLine !== t.line) return `lines ${t.startLine} to ${t.line}`;
  return `line ${t.line}`;
}

/** Plain text of a comment. Markdown is not rendered; HTML-only bodies lose their tags. */
export function commentText(c: { body?: string; bodyHtml: string }): string {
  return c.body ?? c.bodyHtml.replace(/<[^>]+>/g, '');
}

export function threadMode(g: Pick<GroupedThread, 'resolved'>, expanded: boolean): ThreadMode {
  if (!g.resolved) return 'open';
  return expanded ? 'resolved-expanded' : 'resolved-collapsed';
}

/** The controls a thread item shows. Drafts have Edit and Delete instead of reply and resolve. */
export interface ThreadControls {
  reply: boolean;
  resolve: boolean;
  unresolve: boolean;
  outdatedMarker: boolean;
  edit: boolean;
  delete: boolean;
  pendingPill: boolean;
}

export function threadControls(g: Pick<GroupedThread, 'draft' | 'resolved' | 'outdated'>, mode: ThreadMode): ThreadControls {
  if (g.draft) {
    return {
      reply: false,
      resolve: false,
      unresolve: false,
      outdatedMarker: g.outdated,
      edit: true,
      delete: true,
      pendingPill: true,
    };
  }
  const open = mode === 'open';
  return {
    reply: open,
    resolve: open,
    unresolve: mode === 'resolved-expanded',
    outdatedMarker: g.outdated,
    edit: false,
    delete: false,
    pendingPill: false,
  };
}

/** Keys on a focused thread. `x` resolves; Ctrl+Enter posts a reply from the reply box. */
export type ThreadKeyAction = 'resolve' | 'none';

export function threadKeyAction(key: string, ctrl: boolean, typing: boolean): ThreadKeyAction {
  if (typing || ctrl) return 'none';
  return key === 'x' ? 'resolve' : 'none';
}
