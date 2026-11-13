import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { GithubClient, IMAGE_MAX_BYTES } from '../server/github-client';
import { parseImageUrl, sniffImageType, type FetchedImage, type ImageTarget } from '../shared/image-url';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { createSanitizer } from '../web/sanitize';

const ORG = 'acme-co';
const SHA = '89a446a69659ae7f77043f7a669de1bd2cddd022';
const BLOB = `https://github.com/${ORG}/acme-web/blob/${SHA}/before-signatures.png?raw=true`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SECRET = 'ghp_secret_token_value';

describe('image allowlist', () => {
  it('accepts the real GitHub URL forms', () => {
    expect(parseImageUrl(BLOB, [ORG])).toEqual({
      kind: 'contents',
      org: ORG,
      repo: 'acme-web',
      ref: SHA,
      path: ['before-signatures.png'],
    });
    expect(parseImageUrl(`https://github.com/${ORG}/R/raw/main/a/b.png`, [ORG])?.kind).toBe('contents');
    expect(parseImageUrl(`https://raw.githubusercontent.com/${ORG}/R/${SHA}/x.png`, [ORG])?.kind).toBe('contents');
    expect(parseImageUrl('https://user-images.githubusercontent.com/1/a.png', [ORG])?.kind).toBe('hosted');
    expect(parseImageUrl('https://private-user-images.githubusercontent.com/1/a.png?jwt=x', [ORG])?.kind).toBe('hosted');
    expect(parseImageUrl('https://github.com/user-attachments/assets/0a1b-2c', [ORG])?.kind).toBe('attachment');
  });

  it.each([
    ['http', `http://github.com/${ORG}/R/blob/${SHA}/a.png`],
    ['other host', 'https://evil.com/a.png'],
    ['lookalike host', 'https://github.com.evil.com/user-attachments/assets/x'],
    ['userinfo trick', `https://github.com@evil.com/${ORG}/R/blob/${SHA}/a.png`],
    ['userinfo on allowed host', `https://user:pw@github.com/${ORG}/R/blob/${SHA}/a.png`],
    ['port', `https://github.com:8443/${ORG}/R/blob/${SHA}/a.png`],
    ['other org', `https://github.com/other-org/R/blob/${SHA}/a.png`],
    ['other org raw host', `https://raw.githubusercontent.com/other-org/R/${SHA}/a.png`],
    ['traversal', `https://github.com/${ORG}/R/blob/${SHA}/../../x/a.png`],
    ['encoded traversal', `https://github.com/${ORG}/R/blob/${SHA}/%2e%2e/a.png`],
    ['encoded slash', `https://github.com/${ORG}/R/blob/${SHA}/a%2Fb.png`],
    ['repo traversal', `https://github.com/${ORG}/../blob/${SHA}/a.png`],
    ['non-image github path', `https://github.com/${ORG}/R/issues/1`],
    ['bare repo', `https://github.com/${ORG}/R`],
    ['attachment sub path', 'https://github.com/user-attachments/assets/a/b'],
    ['not a URL', 'not a url'],
    ['empty', ''],
  ])('rejects %s', (_name, url) => {
    expect(parseImageUrl(url, [ORG])).toBeUndefined();
  });

  it('sniffs raster types and refuses svg', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('GIF89a....'))).toBe('image/gif');
    expect(sniffImageType(new TextEncoder().encode('RIFF....WEBP'))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
  });
});

describe('sanitizer image rewrite', () => {
  const clean = createSanitizer(new JSDOM('').window as unknown as Window & typeof globalThis);

  it('routes allowlisted images through the proxy', () => {
    const out = clean(`<img src="${BLOB}" alt="x">`);
    expect(out).toContain(`src="/api/image?u=${encodeURIComponent(BLOB)}"`);
  });

  it('prefers an allowlisted data-canonical-src and drops srcset and the attribute', () => {
    const out = clean(
      `<img src="https://camo.githubusercontent.com/abc" data-canonical-src="${BLOB}" srcset="https://evil.com/a.png 2x">`,
    );
    expect(out).toContain(`/api/image?u=${encodeURIComponent(BLOB)}`);
    expect(out).not.toContain('srcset');
    expect(out).not.toContain('data-canonical-src');
  });

  it('leaves other sources alone', () => {
    expect(clean('<img src="https://example.com/a.png">')).toContain('src="https://example.com/a.png"');
  });

  it('keeps link behaviour', () => {
    expect(clean('<a href="https://x.test">x</a>')).toContain('rel="noopener noreferrer"');
  });
});

const headers = { host: '127.0.0.1:4477' };
const get = (app: ReturnType<typeof createApp>, u: string) =>
  app.request(`http://127.0.0.1:4477/api/image?u=${encodeURIComponent(u)}`, { headers });

class Fake extends FixtureProvider {
  seen: ImageTarget[] = [];
  constructor(private readonly result: () => Promise<FetchedImage>) {
    super();
  }
  override async image(t: ImageTarget): Promise<FetchedImage> {
    this.seen.push(t);
    return this.result();
  }
}

const appWith = (p: FixtureProvider) =>
  createApp({ provider: p, port: 4477, token: 't', settings: { ...DEFAULT_SETTINGS, orgs: [ORG] } });

describe('GET /api/image', () => {
  it('serves an allowed image with safe headers', async () => {
    const p = new Fake(async () => ({ bytes: PNG, contentType: 'image/png' }));
    const res = await get(appWith(p), BLOB);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(p.seen).toHaveLength(1);
  });

  it('answers 400 without calling the provider for a disallowed URL', async () => {
    const p = new Fake(async () => ({ bytes: PNG, contentType: 'image/png' }));
    for (const u of ['https://evil.com/a.png', 'https://github.com/other/R/blob/x/a.png', '']) {
      expect((await get(appWith(p), u)).status).toBe(400);
    }
    expect(p.seen).toHaveLength(0);
  });

  it('is behind the host guard', async () => {
    const res = await appWith(new FixtureProvider()).request(
      `http://127.0.0.1:4477/api/image?u=${encodeURIComponent(BLOB)}`,
      { headers: { host: 'evil.example:4477' } },
    );
    expect(res.status).toBe(403);
  });

  it('serves a synthetic PNG in fixture mode', async () => {
    const res = await get(appWith(new FixtureProvider()), BLOB);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(sniffImageType(new Uint8Array(await res.arrayBuffer()))).toBe('image/png');
  });
});

function client(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; auth?: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const h = init.headers as Record<string, string>;
    calls.push({ url, auth: h.Authorization });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { c: new GithubClient(SECRET, fetchImpl, () => undefined), calls };
}

describe('GithubClient.image', () => {
  const contents = parseImageUrl(BLOB, [ORG])!;

  it('reads repo files from the contents API with the raw media type', async () => {
    const { c, calls } = client(() => new Response(PNG));
    const img = await c.image(contents);
    expect(img.contentType).toBe('image/png');
    expect(calls[0]!.url).toBe(
      `https://api.github.com/repos/${ORG}/acme-web/contents/before-signatures.png?ref=${SHA}`,
    );
  });

  it('refuses a body that is not a raster image, whatever the type header says', async () => {
    const { c } = client(() => new Response('<svg/>', { headers: { 'content-type': 'image/png' } }));
    await expect(c.image(contents)).rejects.toMatchObject({ status: 415 });
  });

  it('enforces the size cap on the declared and the streamed length', async () => {
    const declared = client(() => new Response(PNG, { headers: { 'content-length': String(IMAGE_MAX_BYTES + 1) } }));
    await expect(declared.c.image(contents)).rejects.toMatchObject({ status: 413 });
    const big = new Uint8Array(IMAGE_MAX_BYTES + 1);
    big.set(PNG);
    await expect(client(() => new Response(big)).c.image(contents)).rejects.toMatchObject({ status: 413 });
  });

  it('sends the token to an attachment URL once and never to a redirect target', async () => {
    const signed = 'https://private-user-images.githubusercontent.com/1/a.png?jwt=j';
    const { c, calls } = client((url) =>
      url.startsWith('https://github.com/')
        ? new Response(null, { status: 302, headers: { location: signed } })
        : new Response(PNG),
    );
    await c.image(parseImageUrl('https://github.com/user-attachments/assets/abc', [ORG])!);
    expect(calls.map((x) => x.url)).toEqual(['https://github.com/user-attachments/assets/abc', signed]);
    expect(calls[0]!.auth).toBe(`Bearer ${SECRET}`);
    expect(calls[1]!.auth).toBeUndefined();
  });

  it('refuses a redirect off the allowlist', async () => {
    const { c, calls } = client(() => new Response(null, { status: 302, headers: { location: 'https://evil.com/a.png' } }));
    await expect(c.image(parseImageUrl('https://github.com/user-attachments/assets/abc', [ORG])!)).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });

  it('fetches hosted URLs without the token', async () => {
    const { c, calls } = client(() => new Response(PNG));
    await c.image(parseImageUrl('https://user-images.githubusercontent.com/1/a.png', [ORG])!);
    expect(calls[0]!.auth).toBeUndefined();
  });

  it('keeps the token out of route output on failure', async () => {
    const { c } = client(() => new Response('nope', { status: 404 }));
    const p = new FixtureProvider();
    p.image = (t) => c.image(t);
    const res = await get(appWith(p), BLOB);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(SECRET);
  });
});
