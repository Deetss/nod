import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from '../electron/hub';
import { CHECK_MS, HubWatch, MIN_SWITCH_MS, type WatchMode } from '../electron/hub-watch';
import { pushSeen, tokenFromHtml } from '../electron/seen-push';

const HUB = 'https://hub.example.ts.net';

/** A watch over a scripted probe and a hand-moved clock. */
function rig(mode: WatchMode, toHub: () => Promise<void> = async () => undefined) {
  let now = 0;
  const answers: boolean[] = [];
  const probe = vi.fn(async () => answers.shift() ?? true);
  const actions = { toLocal: vi.fn(async () => undefined), toHub: vi.fn(toHub), log: vi.fn() };
  const watch = new HubWatch(mode, probe, actions, () => now);
  /** Advances the clock by one check interval, then checks with the given answer. */
  const tick = async (ok: boolean) => {
    now += CHECK_MS;
    answers.push(ok);
    await watch.check();
  };
  return { watch, actions, probe, answers, tick, at: (t: number) => (now = t) };
}

describe('HubWatch down detection', () => {
  it('needs two failed checks in a row', async () => {
    const r = rig('hub');
    r.at(MIN_SWITCH_MS);
    await r.tick(false);
    await r.tick(true);
    await r.tick(false);
    expect(r.watch.mode).toBe('hub');
    await r.tick(false);
    expect(r.watch.mode).toBe('local');
    expect(r.actions.toLocal).toHaveBeenCalledTimes(1);
  });

  it('waits out 30 s since the last switch', async () => {
    const r = rig('hub');
    await r.tick(false);
    await r.tick(false);
    expect(r.watch.mode).toBe('hub');
    await r.tick(false);
    expect(r.watch.mode).toBe('local');
  });
});

describe('HubWatch reconnect', () => {
  it('needs two good checks, and never flips back within 30 s', async () => {
    const r = rig('hub');
    r.at(MIN_SWITCH_MS);
    await r.tick(false);
    await r.tick(false);
    expect(r.watch.mode).toBe('local');
    await r.tick(true);
    await r.tick(true);
    expect(r.watch.mode).toBe('local');
    await r.tick(true);
    expect(r.watch.mode).toBe('hub');
    expect(r.actions.toHub).toHaveBeenCalledTimes(1);
  });

  it('starts over after a failed check', async () => {
    const r = rig('local');
    r.at(MIN_SWITCH_MS);
    await r.tick(true);
    await r.tick(false);
    await r.tick(true);
    expect(r.watch.mode).toBe('local');
    await r.tick(true);
    expect(r.watch.mode).toBe('hub');
  });

  it('stays local and logs when sending marks fails', async () => {
    const r = rig('local', async () => {
      throw new Error('seen merge answered 500');
    });
    r.at(MIN_SWITCH_MS);
    await r.tick(true);
    await r.tick(true);
    expect(r.watch.mode).toBe('local');
    expect(r.actions.log).toHaveBeenCalledWith('[hub] could not switch to hub: seen merge answered 500');
  });

  it('Retry checks now and reconnects on two good answers', async () => {
    const r = rig('local');
    r.at(MIN_SWITCH_MS);
    r.answers.push(true, true);
    await r.watch.retry();
    expect(r.probe).toHaveBeenCalledTimes(2);
    expect(r.watch.mode).toBe('hub');
  });

  it('Retry stops after a failed check', async () => {
    const r = rig('local');
    r.at(MIN_SWITCH_MS);
    r.answers.push(false, true);
    await r.watch.retry();
    expect(r.probe).toHaveBeenCalledTimes(1);
    expect(r.watch.mode).toBe('local');
  });

  it('shares a check already running', async () => {
    const r = rig('local');
    await Promise.all([r.watch.check(), r.watch.check()]);
    expect(r.probe).toHaveBeenCalledTimes(1);
  });
});

const MARK = { id: 'PR_1', updatedAt: '2026-11-12T10:00:00Z', headSha: 'bbb', commitCount: 3 };
const TOKEN = 'f'.repeat(64);
const PAGE = `<html><head><meta name="nod-token" content="${TOKEN}" /></head></html>`;

describe('pushSeen', () => {
  it('reads the token from the hub page and posts with its Origin', async () => {
    const calls: [string, RequestInit][] = [];
    const fetcher: Fetcher = async (url, init) => {
      calls.push([url, init]);
      return url.endsWith('/') ? new Response(PAGE) : Response.json({ changed: 1 });
    };
    expect(await pushSeen(HUB, [MARK], fetcher)).toBe(1);
    const [, post] = calls[1]!;
    expect(calls[1]![0]).toBe(`${HUB}/api/seen/merge`);
    expect(post.headers).toMatchObject({ origin: HUB, 'x-nod-token': TOKEN });
    expect(post.redirect).toBe('manual');
    expect(JSON.parse(String(post.body))).toEqual({ marks: [MARK] });
  });

  it('sends nothing when there are no marks', async () => {
    const fetcher = vi.fn<Fetcher>();
    expect(await pushSeen(HUB, [], fetcher)).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('throws on a refusal, so the window stays local', async () => {
    const fetcher: Fetcher = async (url) => (url.endsWith('/') ? new Response(PAGE) : new Response('no', { status: 403 }));
    await expect(pushSeen(HUB, [MARK], fetcher)).rejects.toThrow('403');
  });

  it('finds the token only in the meta tag', () => {
    expect(tokenFromHtml(PAGE)).toBe(TOKEN);
    expect(tokenFromHtml('<meta name="nod-token" content="__NOD_TOKEN__" />')).toBeUndefined();
    expect(tokenFromHtml('<p>no token</p>')).toBeUndefined();
  });
});
