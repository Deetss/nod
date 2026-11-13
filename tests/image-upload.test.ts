import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { ApiError, GithubClient } from '../server/github-client';
import { UPLOAD_MAX_BYTES, type UploadType } from '../shared/image-upload';

const PORT = 4478;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SECRET = 'gho_secret';
const ASSET = 'https://github.com/user-attachments/assets/1a2b3c';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

class Spy extends FixtureProvider {
  uploads: { repo: string; name: string; type: UploadType; size: number }[] = [];
  fail: Error | undefined;
  override async uploadImage(repo: string, name: string, type: UploadType, bytes: Uint8Array) {
    if (this.fail) throw this.fail;
    this.uploads.push({ repo, name, type, size: bytes.byteLength });
    return { url: ASSET };
  }
}

function upload(spy: Spy, body: Uint8Array<ArrayBuffer>, opts: { type?: string; query?: string; token?: string } = {}) {
  const app = createApp({ provider: spy, port: PORT, token: TOKEN });
  return app.request(`${ORIGIN}/api/upload-image?${opts.query ?? 'repo=acme-co/acme-web&name=shot.png'}`, {
    method: 'POST',
    headers: {
      'content-type': opts.type ?? 'image/png',
      host: `127.0.0.1:${PORT}`,
      origin: ORIGIN,
      'x-nod-token': opts.token ?? TOKEN,
    },
    body,
  });
}

describe('POST /api/upload-image', () => {
  it('passes the image to the provider and returns its URL', async () => {
    const spy = new Spy();
    const res = await upload(spy, PNG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: ASSET });
    expect(spy.uploads).toEqual([{ repo: 'acme-co/acme-web', name: 'shot.png', type: 'image/png', size: PNG.byteLength }]);
  });

  it('names a nameless paste after its type and strips path parts', async () => {
    const spy = new Spy();
    await upload(spy, JPEG, { type: 'image/jpeg', query: 'repo=acme-co/acme-web' });
    await upload(spy, PNG, { query: 'repo=acme-co/acme-web&name=..%2F..%2Fetc%2Fx.png' });
    expect(spy.uploads.map((u) => u.name)).toEqual(['image.jpeg', 'x.png']);
  });

  it('refuses types outside png, jpeg, gif and webp', async () => {
    const spy = new Spy();
    const res = await upload(spy, new TextEncoder().encode('<svg/>'), { type: 'image/svg+xml' });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'Only PNG, JPEG, GIF and WebP images can be uploaded' });
    expect(spy.uploads).toEqual([]);
  });

  it('refuses bytes that do not match the declared type', async () => {
    const spy = new Spy();
    expect((await upload(spy, JPEG, { type: 'image/png' })).status).toBe(415);
    expect(spy.uploads).toEqual([]);
  });

  it('refuses an image over 10 MB', async () => {
    const spy = new Spy();
    const big = new Uint8Array(UPLOAD_MAX_BYTES + 1);
    big.set(PNG);
    const res = await upload(spy, big);
    expect(res.status).toBe(413);
    expect(spy.uploads).toEqual([]);
  });

  it('refuses a bad repo and an empty body', async () => {
    const spy = new Spy();
    expect((await upload(spy, PNG, { query: 'repo=..' })).status).toBe(400);
    expect((await upload(spy, new Uint8Array())).status).toBe(400);
    expect(spy.uploads).toEqual([]);
  });

  it('sits behind the mutation guard', async () => {
    const spy = new Spy();
    expect((await upload(spy, PNG, { token: 'wrong' })).status).toBe(403);
    expect(spy.uploads).toEqual([]);
  });

  it('reports a GitHub refusal as 502 with its message', async () => {
    const spy = new Spy();
    spy.fail = new ApiError('Uploading images needs write access to this repository', 'http', 404);
    const res = await upload(spy, PNG);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Uploading images needs write access to this repository' });
  });
});

describe('GithubClient.uploadAsset', () => {
  function client(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const logs: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { c: new GithubClient(SECRET, fetchImpl, (l) => logs.push(l)), calls, logs };
  }

  it('posts the bytes to the user-attachments endpoint gh --attach uses', async () => {
    const { c, calls, logs } = client(201, { url: ASSET });
    expect(await c.uploadAsset(42, 'shot.png', 'image/png', PNG)).toBe(ASSET);
    const u = new URL(calls[0]?.url ?? '');
    expect(u.origin + u.pathname).toBe('https://uploads.github.com/user-attachments/assets');
    expect(Object.fromEntries(u.searchParams)).toEqual({ name: 'shot.png', content_type: 'image/png', repository_id: '42' });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(calls[0]?.init.body).toBe(PNG);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('explains a 404 as missing write access', async () => {
    const { c } = client(404, { message: 'Not Found' });
    await expect(c.uploadAsset(42, 'shot.png', 'image/png', PNG)).rejects.toThrow(
      'Uploading images needs write access to this repository',
    );
  });

  it('passes on GitHub text for other refusals and rejects a reply with no URL', async () => {
    await expect(client(422, { message: 'Bad Size' }).c.uploadAsset(1, 'a.png', 'image/png', PNG)).rejects.toThrow('422: Bad Size');
    await expect(client(201, {}).c.uploadAsset(1, 'a.png', 'image/png', PNG)).rejects.toThrow('GitHub returned no image URL');
  });
});
