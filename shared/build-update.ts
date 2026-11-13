/** The build id of a front end that was not built by vite (tests, `vite` dev). It never triggers a reload. */
export const DEV_BUILD = 'dev';

/** Written by vite next to index.html as `{ "build": "<id>" }`, and read by the server that serves it. */
export const BUILD_FILE = 'build.json';

/** The git short sha plus the build time, for example `8152277-2026-11-11T17:12:03Z`. */
export function formatBuildId(sha: string, builtAt: Date): string {
  return `${sha || 'nogit'}-${builtAt.toISOString().replace(/\.\d+Z$/, 'Z')}`;
}

/** What the server says on `/api/events`: its build on connect, or a reload the desktop asked for. */
export type UpdateSignal = { kind: 'build'; build: string } | { kind: 'reload'; build: string; nonce: string };

export type ReloadDecision = 'none' | 'reload' | 'prompt';

export interface ReloadInput {
  signal: UpdateSignal;
  /** The build this page was built as. */
  client: string;
  /** Keys this tab already reloaded for, from sessionStorage. */
  reloaded: ReadonlySet<string>;
  /** True while a comment box holds unsent text. */
  draft: boolean;
}

/**
 * The key a reload is remembered under, so a tab reloads at most once per build and once per
 * "Update phones" press. Undefined when the signal asks for nothing.
 */
export function reloadKey(signal: UpdateSignal, client: string): string | undefined {
  if (signal.kind === 'reload') return `reload:${signal.nonce}`;
  if (!signal.build || signal.build === DEV_BUILD || client === DEV_BUILD) return undefined;
  return signal.build === client ? undefined : `build:${signal.build}`;
}

/** Reload now, offer a reload (a draft would be lost), or do nothing. */
export function reloadDecision({ signal, client, reloaded, draft }: ReloadInput): ReloadDecision {
  const key = reloadKey(signal, client);
  if (!key || reloaded.has(key)) return 'none';
  return draft ? 'prompt' : 'reload';
}

/** The open PR or issue as the `?open=` value phones already understand, for example `pr/acme-co/acme-api/12`. */
export type OpenRef = { kind: 'pr' | 'issue'; repo: string; number: number };

export function openParam(ref: OpenRef): string {
  return `${ref.kind}/${encodeURIComponent(ref.repo)}/${ref.number}`;
}

/**
 * Reads an `open` value back, already URL-decoded by URLSearchParams, so the encoded slash of
 * `owner/name` arrives as a real one. The repo is whatever sits between the kind and the number.
 */
export function parseOpenParam(raw: string | null): OpenRef | undefined {
  const parts = (raw ?? '').split('/');
  const kind = parts[0];
  const repo = parts.slice(1, -1).join('/');
  const number = Number(parts.at(-1));
  if ((kind !== 'pr' && kind !== 'issue') || !repo.includes('/') || !Number.isSafeInteger(number) || number < 1) return undefined;
  return { kind, repo, number };
}

/** The URL to reload to: the same page with `open` replaced by the item on screen. */
export function reloadUrl(current: { pathname: string; search: string }, open: OpenRef | undefined): string {
  const q = new URLSearchParams(current.search);
  q.delete('open');
  q.delete('apk');
  const qs = q.toString();
  // `open` is appended raw; its repo part is already encoded.
  const parts = [qs, open ? `open=${openParam(open)}` : ''].filter(Boolean).join('&');
  return parts ? `${current.pathname}?${parts}` : current.pathname;
}

/** The `/api/phones/update` answer the desktop shows. */
export interface PhonesUpdateResult {
  /** Phones with a live connection that were told to reload. */
  reloaded: number;
  /** Phones without one that got a Web Push instead. */
  notified: number;
  /** Phones told by push that a newer APK is ready. */
  apkNotified: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function phonesUpdateText(r: PhonesUpdateResult): string {
  if (r.reloaded === 0 && r.notified === 0 && r.apkNotified === 0) return 'No phones connected or subscribed';
  const parts = [`Reloaded ${plural(r.reloaded, 'phone', 'phones')}`, `notified ${r.notified}`];
  if (r.apkNotified > 0) parts.push(`${r.apkNotified} told about the app update`);
  return parts.join(', ');
}
