/**
 * Which image URLs the app will load through `/api/image`. The sanitizer uses it to decide
 * what to rewrite and the server uses it to decide what to fetch, so both agree.
 */

export type ImageTarget =
  /** A file in a repo, read through the contents API. */
  | { kind: 'contents'; org: string; repo: string; ref: string; path: string[] }
  /** A GitHub-hosted image URL that is fetched as is, without the token. */
  | { kind: 'hosted'; url: string }
  /**
   * `github.com/user-attachments/assets/<id>`; redirects to a signed URL. `node` names the
   * issue, PR, comment or review whose HTML holds the asset.
   */
  | { kind: 'attachment'; url: string; node?: string };

const MAX_URL_LENGTH = 2048;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
/** A GraphQL global node id, current or legacy base64 form. */
const NODE_ID_RE = /^[A-Za-z0-9_=+/-]{1,128}$/;
const HOSTED_HOSTS = new Set(['user-images.githubusercontent.com', 'private-user-images.githubusercontent.com']);

/** Hosts a redirect from an allowed image URL may land on. */
export const REDIRECT_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  ...HOSTED_HOSTS,
]);

/** Decodes path segments and refuses anything that could reshape the path. */
function segments(pathname: string): string[] | undefined {
  const out: string[] = [];
  for (const raw of pathname.split('/').slice(1)) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return undefined;
    }
    if (seg === '' || seg === '.' || seg === '..' || /[/\\\u0000-\u001f]/.test(seg)) return undefined;
    out.push(seg);
  }
  return out;
}

const sameOrg = (a: string, orgs: readonly string[] | undefined) =>
  !orgs?.length || orgs.some((o) => o.toLowerCase() === a.toLowerCase());

/** Returns the fetch target for an allowed image URL. `orgs`, when non-empty, must include any owner the URL names. */
export function parseImageUrl(raw: string, orgs?: readonly string[]): ImageTarget | undefined {
  if (raw.length > MAX_URL_LENGTH) return undefined;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return undefined;
  const parts = segments(u.pathname);
  if (!parts) return undefined;

  if (HOSTED_HOSTS.has(u.hostname)) return parts.length ? { kind: 'hosted', url: u.href } : undefined;

  if (u.hostname === 'raw.githubusercontent.com') {
    const [o, repo, ref, ...path] = parts;
    if (!o || !repo || !ref || !path.length || !NAME_RE.test(repo) || !sameOrg(o, orgs)) return undefined;
    return { kind: 'contents', org: o, repo, ref, path };
  }

  if (u.hostname === 'github.com') {
    if (parts[0] === 'user-attachments') {
      if (parts.length !== 3 || parts[1] !== 'assets') return undefined;
      const url = u.origin + u.pathname;
      const node = u.searchParams.get('node');
      if (node === null) return { kind: 'attachment', url };
      return NODE_ID_RE.test(node) ? { kind: 'attachment', url, node } : undefined;
    }
    const [o, repo, mode, ref, ...path] = parts;
    if (!o || !repo || !ref || !path.length || (mode !== 'blob' && mode !== 'raw')) return undefined;
    if (!NAME_RE.test(repo) || !sameOrg(o, orgs)) return undefined;
    return { kind: 'contents', org: o, repo, ref, path };
  }
  return undefined;
}

/** The contents API path for a repo file, with every segment encoded. */
export function contentsPath(t: Extract<ImageTarget, { kind: 'contents' }>): string {
  const file = t.path.map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(t.org)}/${encodeURIComponent(t.repo)}/contents/${file}?ref=${encodeURIComponent(t.ref)}`;
}

export const imageProxyUrl = (src: string) => `/api/image?u=${encodeURIComponent(src)}`;

/** An uploaded asset's uuid, as GitHub writes it in attachment and hosted image URLs. */
export const ASSET_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ATTACHMENT_ID_RE = new RegExp(`^/user-attachments/assets/(${ASSET_UUID})$`, 'i');
const HOSTED_ID_RE = new RegExp(`^/\\d+/\\d+-(${ASSET_UUID})\\.[A-Za-z0-9]+$`, 'i');

/** The stable URL of an uploaded asset, safe to hand the client. `node` lets a cold server find its signed URL. */
export const attachmentUrl = (id: string, node?: string) =>
  `https://github.com/user-attachments/assets/${id}${node ? `?node=${encodeURIComponent(node)}` : ''}`;

/** The asset uuid an attachment or hosted upload URL names, lowercased. */
export function assetId(target: ImageTarget): string | undefined {
  if (target.kind === 'contents') return undefined;
  const u = new URL(target.url);
  const re = target.kind === 'attachment' ? ATTACHMENT_ID_RE : HOSTED_ID_RE;
  return re.exec(u.pathname)?.[1]?.toLowerCase();
}

export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
}

/** Raster formats only. SVG and anything else is refused, whatever the server claimed. */
export function sniffImageType(b: Uint8Array): string | undefined {
  const at = (i: number, s: string) => [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0));
  if (b.length >= 8 && b[0] === 0x89 && at(1, 'PNG')) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && (at(0, 'GIF87a') || at(0, 'GIF89a'))) return 'image/gif';
  if (b.length >= 12 && at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  return undefined;
}
