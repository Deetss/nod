import type { IssueComment, IssueDetail } from '../shared/issue-types';
import { ASSET_UUID, attachmentUrl, type FetchedImage } from '../shared/image-url';
import type { PrDetail, PrThreadItem } from '../shared/types';
import { ApiError, type GithubClient } from './github-client';
import { ITEM_HTML_QUERY, type ItemHtmlResponse } from './queries';
import type { LogSink } from './request-log';

/**
 * A signed upload URL in GitHub-rendered HTML. Its `jwt` grants access for a few minutes
 * and must never reach the client or a log.
 */
const SIGNED_RE = new RegExp(
  `https://private-user-images\\.githubusercontent\\.com/\\d+/\\d+-(${ASSET_UUID})\\.[A-Za-z0-9]+\\?[^"'\\s<>]+`,
  'gi',
);

/** A JWT this close to expiry counts as expired, so a fetch never races it. */
const EXPIRY_MARGIN_MS = 30_000;
/** Assumed lifetime of a JWT whose expiry cannot be read. */
const UNKNOWN_EXPIRY_MS = 60_000;
const MAX_ASSETS = 2000;
const MAX_CACHED_BYTES = 64 * 1024 * 1024;

interface Signed {
  url: string;
  exp: number;
}

/** The JWT's `exp` in ms, or undefined when it cannot be read. */
function jwtExpiry(url: string): number | undefined {
  try {
    const jwt = new URL(url).searchParams.get('jwt');
    const payload = jwt?.split('.')[1];
    if (!payload) return undefined;
    const exp = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Drops the oldest entries until `map` holds at most `max`. */
function trim<K, V>(map: Map<K, V>, max: number): void {
  for (const key of map.keys()) {
    if (map.size <= max) return;
    map.delete(key);
  }
}

/**
 * Private-repo uploads only load through signed URLs that expire within minutes. Rendered
 * HTML leaves the server with each signed URL replaced by the asset's stable
 * `user-attachments` URL. The proxy maps that back to the signed URL, re-reading the
 * owning item's HTML once the JWT has expired, and keeps the bytes by asset uuid.
 */
export class AttachmentImages {
  private readonly signed = new Map<string, Signed>();
  /** Node id of the issue, PR, comment or review whose HTML holds each asset. */
  private readonly sources = new Map<string, string>();
  private readonly bytes = new Map<string, FetchedImage>();
  private readonly reading = new Map<string, Promise<void>>();
  private cachedBytes = 0;

  constructor(
    /** Fetches a signed URL without credentials; the JWT carries access. */
    private readonly fetchSigned: (url: string) => Promise<FetchedImage>,
    /** One GraphQL read of a node's `bodyHTML`. */
    private readonly readHtml: (nodeId: string) => Promise<string>,
    private readonly log: LogSink,
    private readonly now: () => number = Date.now,
  ) {}

  /** Signed URLs fetched through `client` with no token; expired ones renewed by one GraphQL read. */
  static over(client: GithubClient, log: LogSink, now?: () => number): AttachmentImages {
    return new AttachmentImages(
      (url) => client.image({ kind: 'hosted', url }),
      async (id) => (await client.graphql<ItemHtmlResponse>(ITEM_HTML_QUERY, { id })).node?.bodyHTML ?? '',
      log,
      now,
    );
  }

  /** Swaps every signed URL in `html` for its stable URL, tagged with `nodeId`, and remembers that source. */
  rewrite(html: string, nodeId: string): string {
    return html.replace(SIGNED_RE, (raw: string, uuid: string) => {
      const id = uuid.toLowerCase();
      const url = raw.replaceAll('&amp;', '&');
      const exp = jwtExpiry(url) ?? this.now() + UNKNOWN_EXPIRY_MS;
      if (exp >= (this.signed.get(id)?.exp ?? 0)) this.signed.set(id, { url, exp });
      this.sources.set(id, nodeId);
      trim(this.signed, MAX_ASSETS);
      trim(this.sources, MAX_ASSETS);
      return attachmentUrl(id, nodeId);
    });
  }

  prDetail(d: PrDetail): PrDetail {
    return {
      ...d,
      ...(d.bodyHtml !== undefined ? { bodyHtml: this.rewrite(d.bodyHtml, d.summary.id) } : {}),
      ...(d.thread ? { thread: d.thread.map((t) => this.threadItem(t)) } : {}),
    };
  }

  issueDetail(d: IssueDetail): IssueDetail {
    return {
      ...d,
      bodyHtml: this.rewrite(d.bodyHtml, d.summary.id),
      comments: d.comments.map((c) => this.comment(c)),
    };
  }

  private comment(c: IssueComment): IssueComment {
    return { ...c, bodyHtml: this.rewrite(c.bodyHtml, c.id) };
  }

  private threadItem(t: PrThreadItem): PrThreadItem {
    if (t.kind === 'comment') return { ...t, comment: this.comment(t.comment) };
    if (t.kind === 'review') return { ...t, bodyHtml: this.rewrite(t.bodyHtml, t.id) };
    return { ...t, comments: t.comments.map((c) => this.comment(c)) };
  }

  /**
   * The asset's bytes, from the cache, its signed URL, or `direct` when no rendered HTML
   * has named it. An unknown asset is first looked up in `node`'s current HTML, and is only
   * found if that HTML holds it. Only the uuid is ever logged.
   */
  async image(id: string, direct: () => Promise<FetchedImage>, node?: string): Promise<FetchedImage> {
    const hit = this.bytes.get(id);
    if (hit) {
      this.bytes.delete(id);
      this.bytes.set(id, hit);
      return hit;
    }
    let img: FetchedImage;
    try {
      if (node && !this.known(id)) await this.read(node);
      img = this.known(id) ? await this.fetchSigned(await this.signedUrl(id)) : await direct();
    } catch (e) {
      if (e instanceof ApiError && e.status === 415) this.log(`[image] asset ${id} did not return an image`);
      throw e;
    }
    this.keep(id, img);
    return img;
  }

  private known(id: string): boolean {
    return this.sources.has(id) || this.signed.has(id);
  }

  /** Learns the signed URLs in `node`'s current HTML. Parallel reads of one node share a call. */
  private read(node: string): Promise<void> {
    let pending = this.reading.get(node);
    if (!pending) {
      pending = this.readHtml(node)
        .then((html) => void this.rewrite(html, node))
        .finally(() => this.reading.delete(node));
      this.reading.set(node, pending);
    }
    return pending;
  }

  private async signedUrl(id: string): Promise<string> {
    const live = (s: Signed | undefined) => (s && s.exp - EXPIRY_MARGIN_MS > this.now() ? s.url : undefined);
    const known = live(this.signed.get(id));
    if (known) return known;
    const source = this.sources.get(id);
    if (source) this.rewrite(await this.readHtml(source), source);
    const renewed = live(this.signed.get(id));
    if (!renewed) throw new ApiError('Image link expired', 'http', 404);
    return renewed;
  }

  private keep(id: string, img: FetchedImage): void {
    this.bytes.set(id, img);
    this.cachedBytes += img.bytes.byteLength;
    for (const [key, old] of this.bytes) {
      if (this.cachedBytes <= MAX_CACHED_BYTES) break;
      this.bytes.delete(key);
      this.cachedBytes -= old.bytes.byteLength;
    }
  }
}
