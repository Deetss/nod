import {
  DEFAULT_SETTINGS,
  TRIGGER_KEYS,
  type NotifyItem,
  type NotifyKind,
  type NotifySettings,
  type NotifyTarget,
} from './notify-rules';

/** Validation for everything the renderer sends over the `window.nod` bridge. */

export const MAX_ITEMS = 20;
export const MAX_TITLE = 200;
export const MAX_BODY = 500;
export const MAX_REPO = 201;

/** A full `owner/name` repo. */
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasOnlyKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(v).every((k) => keys.includes(k));
}

export function parseTarget(v: unknown): NotifyTarget | undefined {
  if (!isRecord(v) || !hasOnlyKeys(v, ['kind', 'repo', 'number'])) return undefined;
  const { kind, repo, number } = v;
  if (kind !== 'pr' && kind !== 'issue') return undefined;
  if (typeof repo !== 'string' || repo.length > MAX_REPO || !REPO_RE.test(repo)) return undefined;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return undefined;
  return { kind, repo, number };
}

const KINDS: readonly string[] = [...TRIGGER_KEYS, 'summary', 'test'];

function parseItem(v: unknown): NotifyItem | undefined {
  if (!isRecord(v) || !hasOnlyKeys(v, ['title', 'body', 'target', 'kind'])) return undefined;
  const { title, body, target, kind } = v;
  if (typeof title !== 'string' || title.length === 0 || title.length > MAX_TITLE) return undefined;
  if (typeof body !== 'string' || body.length > MAX_BODY) return undefined;
  if (kind !== undefined && (typeof kind !== 'string' || !KINDS.includes(kind))) return undefined;
  const tagged = kind === undefined ? {} : { kind: kind as NotifyKind };
  if (target === undefined) return { title, body, ...tagged };
  const parsed = parseTarget(target);
  return parsed ? { title, body, target: parsed, ...tagged } : undefined;
}

/** The validated items, or undefined when the payload is malformed in any way. */
export function parseNotifyItems(v: unknown): NotifyItem[] | undefined {
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return undefined;
  const items: NotifyItem[] = [];
  for (const raw of v) {
    const item = parseItem(raw);
    if (!item) return undefined;
    items.push(item);
  }
  return items;
}

/**
 * The validated settings, or undefined on an unknown key or a non-boolean value. A key saved
 * before its trigger existed is missing, and takes the default.
 */
export function parseSettings(v: unknown): NotifySettings | undefined {
  const keys = ['muted', ...TRIGGER_KEYS];
  if (!isRecord(v) || !hasOnlyKeys(v, keys)) return undefined;
  if (!Object.values(v).every((x) => typeof x === 'boolean')) return undefined;
  return { ...DEFAULT_SETTINGS, ...(v as Partial<NotifySettings>) };
}
