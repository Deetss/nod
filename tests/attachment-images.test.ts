import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { AttachmentImages } from '../server/attachment-images';
import { FixtureProvider } from '../server/fixture-provider';
import { ApiError, GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import type { PrRef, StateQuery } from '../server/provider';
import { SeenStore } from '../server/seen';
import type { IssueDetail } from '../shared/issue-types';
import { assetId, attachmentUrl, parseImageUrl } from '../shared/image-url';
import type { PrDetail } from '../shared/types';
import { createSanitizer } from '../web/sanitize';

const TOKEN = 'ghp_secret_token_value';
const UUID = 'e2b77f0d-96bb-4436-8e7b-49d2f52d3a16';
const ATTACHMENT = attachmentUrl(UUID);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const NOW = Date.parse('2026-11-11T12:00:00Z');

const jwt = (expMs: number, tag: string) =>
  ['h', Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000), tag })).toString('base64url'), 's'].join('.');
const signed = (token: string) =>
  `https://private-user-images.githubusercontent.com/1056037/702945921-${UUID}.png?jwt=${token}`;
const bodyHtml = (url: string) =>
  `<p><a target="_blank" rel="noopener noreferrer" href="${url}"><img src="${url}" alt="Layout A" style="max-width: 100%;"></a></p>`;

const LIVE = jwt(NOW + 5 * 60_000, 'live');
const EXPIRED = jwt(NOW - 60_000, 'expired');
const RENEWED = jwt(NOW + 5 * 60_000, 'renewed');

interface Call {
  url: string;
  auth?: string;
  body?: string;
}

/** A GitHub that serves `nodeHtml` as `node.bodyHTML` and the signed image as `image`. */
function github(image: () => Response = () => new Response(PNG), nodeHtml = bodyHtml(signed(RENEWED))) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const h = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, auth: h.Authorization, body: typeof init.body === 'string' ? init.body : undefined });
    if (url === 'https://api.github.com/graphql') {
      return Response.json({ data: { node: { bodyHTML: nodeHtml } } });
    }
    if (url.startsWith('https://private-user-images.githubusercontent.com/')) return image();
    return new Response('unexpected', { status: 500 });
  }) as unknown as typeof fetch;
  const lines: string[] = [];
  const client = new GithubClient(TOKEN, fetchImpl, (l) => lines.push(l));
  return { client, calls, lines, images: AttachmentImages.over(client, (l) => lines.push(l), () => NOW) };
}

const issue = (html: string): IssueDetail =>
  ({
    summary: { id: 'I_338' },
    bodyHtml: html,
    comments: [{ id: 'IC_1', author: 'a', createdAt: '', bodyHtml: html }],
  }) as unknown as IssueDetail;

const noDirect = () => Promise.reject(new Error('direct fetch not expected'));

describe('attachment images', () => {
  it('resolves a user-attachments URL through the bodyHTML signed URL, without the token', async () => {
    const { images, calls } = github();
    const out = images.issueDetail(issue(bodyHtml(signed(LIVE))));
    expect(out.bodyHtml).toContain(`src="${attachmentUrl(UUID, 'I_338')}"`);

    const id = assetId(parseImageUrl(ATTACHMENT)!)!;
    const img = await images.image(id, noDirect);
    expect(img.contentType).toBe('image/png');
    expect(calls).toEqual([{ url: signed(LIVE), auth: undefined, body: undefined }]);
  });

  it('tags each emitted URL with its node id and never the JWT', () => {
    const { images } = github();
    const out = images.issueDetail(issue(bodyHtml(signed(LIVE))));
    expect(out.bodyHtml).toContain(`${ATTACHMENT}?node=I_338`);
    expect(out.comments[0]!.bodyHtml).toContain(`${ATTACHMENT}?node=IC_1`);
    expect(JSON.stringify(out)).not.toContain('jwt');
    expect(parseImageUrl(`${ATTACHMENT}?node=IC_1`)).toEqual({ kind: 'attachment', url: ATTACHMENT, node: 'IC_1' });
  });

  it('resolves a cold asset through one read of the named node', async () => {
    const { images, calls } = github();
    const [a, b] = await Promise.all([images.image(UUID, noDirect, 'IC_1'), images.image(UUID, noDirect, 'IC_1')]);
    expect(a.contentType).toBe('image/png');
    expect(b.contentType).toBe('image/png');
    const reads = calls.filter((c) => c.url.endsWith('/graphql'));
    expect(reads).toHaveLength(1);
    expect(JSON.parse(reads[0]!.body!).variables).toEqual({ id: 'IC_1' });
    expect(calls.some((c) => c.url === signed(RENEWED))).toBe(true);
  });

  it('refuses a node whose HTML does not hold the asset', async () => {
    const other = signed(RENEWED).replace(UUID, '00000000-0000-4000-8000-000000000000');
    const { images, calls } = github(undefined, bodyHtml(other));
    const direct = vi.fn(() => Promise.reject(new ApiError('Not an image', 'http', 415)));
    await expect(images.image(UUID, direct, 'I_forged')).rejects.toMatchObject({ status: 415 });
    expect(direct).toHaveBeenCalledOnce();
    expect(calls.filter((c) => c.url.startsWith('https://private-user-images.'))).toHaveLength(0);
  });

  it('does not read the node again once the asset is known', async () => {
    const { images, calls } = github();
    images.issueDetail(issue(bodyHtml(signed(LIVE))));
    await images.image(UUID, noDirect, 'IC_1');
    expect(calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(0);
  });

  it('re-reads the owning item once when the JWT has expired', async () => {
    const { images, calls } = github();
    images.issueDetail(issue(bodyHtml(signed(EXPIRED))));

    await images.image(UUID, noDirect);
    const reads = calls.filter((c) => c.url.endsWith('/graphql'));
    expect(reads).toHaveLength(1);
    expect(JSON.parse(reads[0]!.body!).variables).toEqual({ id: 'IC_1' });
    expect(calls.at(-1)).toEqual({ url: signed(RENEWED), auth: undefined, body: undefined });
  });

  it('serves a repeat request from the byte cache', async () => {
    const { images, calls } = github();
    images.issueDetail(issue(bodyHtml(signed(LIVE))));
    const first = await images.image(UUID, noDirect);
    const again = await images.image(UUID, noDirect);
    expect(again).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it('rejects an HTML answer and logs only the asset uuid', async () => {
    const { images, lines } = github(
      () => new Response('<!DOCTYPE html><title>Sign in to GitHub</title>', { headers: { 'content-type': 'text/html' } }),
    );
    images.issueDetail(issue(bodyHtml(signed(LIVE))));
    await expect(images.image(UUID, noDirect)).rejects.toMatchObject({ status: 415 });
    const warnings = lines.filter((l) => l.startsWith('[image]'));
    expect(warnings).toEqual([`[image] asset ${UUID} did not return an image`]);
    for (const l of lines) {
      expect(l).not.toContain(LIVE);
      expect(l).not.toContain(TOKEN);
    }
  });

  it('fetches an asset no rendered HTML has named directly', async () => {
    const { images } = github();
    const img = await images.image(UUID, async () => ({ bytes: PNG, contentType: 'image/png' }));
    expect(img.contentType).toBe('image/png');
  });

  it('rewrites the PR body, comments, reviews and review threads', () => {
    const { images } = github();
    const html = bodyHtml(signed(LIVE));
    const comment = { id: 'C', author: 'a', createdAt: '', bodyHtml: html };
    const pr = {
      summary: { id: 'PR_1' },
      body: '',
      bodyHtml: html,
      thread: [
        { kind: 'comment', at: '', comment },
        { kind: 'review', at: '', id: 'R', actor: 'a', verdict: 'commented', bodyHtml: html },
        { kind: 'thread', at: '', id: 'T', path: 'a', resolved: false, comments: [comment] },
      ],
    } as unknown as PrDetail;
    const out = JSON.stringify(images.prDetail(pr));
    expect(out).not.toContain('jwt=');
    expect(out.split(ATTACHMENT).length - 1).toBe(8);
  });
});

describe('GithubProvider.image', () => {
  it('routes attachment and private hosted URLs through the asset map', async () => {
    const { client, calls } = github();
    const p = new GithubProvider(client, new SeenStore(null));
    const hosted = parseImageUrl(signed(LIVE))!;
    expect(assetId(hosted)).toBe(UUID);
    await p.image(hosted);
    await p.image(parseImageUrl(ATTACHMENT)!);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.auth).toBeUndefined();
  });
});

describe('detail HTML sent to the client', () => {
  class Rewriting extends FixtureProvider {
    constructor(private readonly images: AttachmentImages) {
      super();
    }
    override async issueDetail(ref: PrRef, state: StateQuery): Promise<IssueDetail> {
      const base = await super.issueDetail(ref, state);
      return this.images.issueDetail({ ...base, bodyHtml: bodyHtml(signed(LIVE)) });
    }
  }

  it('never carries the JWT, and the sanitizer proxies the stable URL', async () => {
    const { images } = github();
    const app = createApp({ provider: new Rewriting(images), port: 4477, token: 't' });
    const issues = await new FixtureProvider().issues(undefined);
    const first = issues.issues[0]!;
    const res = await app.request(`http://127.0.0.1:4477/api/issue/${first.repo}/${first.number}`, {
      headers: { host: '127.0.0.1:4477' },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(LIVE);
    expect(text).not.toContain('jwt');

    const clean = createSanitizer(new JSDOM('').window as unknown as Window & typeof globalThis);
    const html = clean((JSON.parse(text) as IssueDetail).bodyHtml);
    const node = (await new FixtureProvider().issueDetail(first, undefined as unknown as StateQuery)).summary.id;
    expect(html).toContain(`src="/api/image?u=${encodeURIComponent(attachmentUrl(UUID, node))}"`);
  });

  it('rejects a malformed node id with 400', async () => {
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: 't' });
    for (const node of ['I_1<script>', 'a b', 'x'.repeat(129), '']) {
      const u = encodeURIComponent(`${ATTACHMENT}?node=${encodeURIComponent(node)}`);
      const res = await app.request(`http://127.0.0.1:4477/api/image?u=${u}`, { headers: { host: '127.0.0.1:4477' } });
      expect(res.status).toBe(400);
    }
  });
});
