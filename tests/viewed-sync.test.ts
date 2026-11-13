// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { keepIfSame } from '../web/issues/stable';
import {
  SETTLED_TTL_MS,
  ViewedWriter,
  applyOverride,
  reconcileOverrides,
  revertOverride,
  setOverride,
  settleOverride,
  viewedKey,
  type WriteResult,
} from '../web/viewed-sync';

const K = viewedKey('PR1', 'a.rb');
const ok: WriteResult = { ok: true, message: 'ok' };
const no: WriteResult = { ok: false, message: 'boom' };

/** A send whose calls finish only when the test releases them, in the order chosen. */
function gated() {
  const calls: { prId: string; path: string; viewed: boolean; done: (r: WriteResult | Error) => void }[] = [];
  const send = (prId: string, path: string, viewed: boolean) =>
    new Promise<WriteResult>((resolve, reject) => {
      calls.push({ prId, path, viewed, done: (r) => (r instanceof Error ? reject(r) : resolve(r)) });
    });
  return { calls, send };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function writer(send: ConstructorParameters<typeof ViewedWriter>[0]['send']) {
  const events: string[] = [];
  const w = new ViewedWriter({
    send,
    sleep: async () => undefined,
    onSettled: (key, v) => events.push(`ok ${key} ${v}`),
    onFailed: (key, v, m) => events.push(`fail ${key} ${v} ${m}`),
  });
  return { w, events };
}

describe('ViewedWriter', () => {
  it('sends one request at a time per file and only the latest wanted value after it', async () => {
    const { calls, send } = gated();
    const { w, events } = writer(send);
    w.write('PR1', 'a.rb', true);
    w.write('PR1', 'a.rb', false);
    w.write('PR1', 'a.rb', true);
    w.write('PR1', 'a.rb', false);
    await tick();
    expect(calls.map((c) => c.viewed)).toEqual([true]);
    calls[0]!.done(ok);
    await tick();
    expect(calls.map((c) => c.viewed)).toEqual([true, false]);
    calls[1]!.done(ok);
    await w.idle();
    expect(calls).toHaveLength(2);
    expect(events).toEqual([`ok ${K} false`]);
  });

  it('does not wait across different files', async () => {
    const { calls, send } = gated();
    const { w } = writer(send);
    w.write('PR1', 'a.rb', true);
    w.write('PR1', 'b.rb', true);
    w.write('PR2', 'a.rb', true);
    await tick();
    expect(calls).toHaveLength(3);
    calls.forEach((c) => c.done(ok));
    await w.idle();
  });

  it('retries once after a failure and settles when the retry works', async () => {
    let n = 0;
    const { w, events } = writer(async () => (++n === 1 ? no : ok));
    w.write('PR1', 'a.rb', true);
    await w.idle();
    expect(n).toBe(2);
    expect(events).toEqual([`ok ${K} true`]);
  });

  it('retries once after a thrown error then reports failure', async () => {
    let n = 0;
    const { w, events } = writer(async () => {
      n++;
      throw new Error('network down');
    });
    w.write('PR1', 'a.rb', true);
    await w.idle();
    expect(n).toBe(2);
    expect(events).toEqual([`fail ${K} true network down`]);
  });

  it('does not report a failure that a newer click superseded', async () => {
    const { calls, send } = gated();
    const { w, events } = writer(send);
    w.write('PR1', 'a.rb', true);
    await tick();
    w.write('PR1', 'a.rb', false);
    calls[0]!.done(no);
    await tick();
    expect(calls.map((c) => c.viewed)).toEqual([true, false]);
    calls[1]!.done(ok);
    await w.idle();
    expect(events).toEqual([`ok ${K} false`]);
  });

  it('accepts a new write after the previous one finished', async () => {
    const sent: boolean[] = [];
    const { w } = writer(async (_p, _f, v) => {
      sent.push(v);
      return ok;
    });
    w.write('PR1', 'a.rb', true);
    await w.idle();
    w.write('PR1', 'a.rb', false);
    await w.idle();
    expect(sent).toEqual([true, false]);
  });
});

describe('viewed overrides', () => {
  it('shows the override over the server value', () => {
    const ov = setOverride({}, K, true);
    expect(applyOverride(ov, K, false)).toBe(true);
    expect(applyOverride(ov, viewedKey('PR1', 'b.rb'), false)).toBe(false);
  });

  it('keeps a pending override when a refetch still shows the old value', () => {
    const ov = setOverride({}, K, true);
    expect(reconcileOverrides(ov, () => false, 1000)).toBe(ov);
  });

  it('keeps a pending override even when it matches the server', () => {
    const ov = setOverride({}, K, true);
    expect(reconcileOverrides(ov, () => true, 1000)).toBe(ov);
  });

  it('keeps a confirmed override while the server lags, then drops it when it agrees', () => {
    const ov = settleOverride(setOverride({}, K, true), K, true, 1000);
    expect(reconcileOverrides(ov, () => false, 2000)).toBe(ov);
    expect(reconcileOverrides(ov, () => true, 2000)).toEqual({});
  });

  it('drops a confirmed override after the TTL even if the server never agrees', () => {
    const ov = settleOverride(setOverride({}, K, true), K, true, 1000);
    expect(reconcileOverrides(ov, () => false, 1000 + SETTLED_TTL_MS + 1)).toEqual({});
  });

  it('keeps overrides for PRs whose detail is not loaded', () => {
    const ov = settleOverride(setOverride({}, K, true), K, true, 1000);
    expect(reconcileOverrides(ov, () => undefined, 2000)).toBe(ov);
  });

  it('does not settle a mark the user changed again', () => {
    const ov = setOverride(setOverride({}, K, true), K, false);
    expect(settleOverride(ov, K, true, 5)).toBe(ov);
  });

  it('a new toggle makes a confirmed mark pending again', () => {
    const settled = settleOverride(setOverride({}, K, true), K, true, 5);
    expect(setOverride(settled, K, false)[K]).toEqual({ value: false });
  });

  it('reverts a failed write to the server value, but not past a newer toggle', () => {
    const ov = setOverride({}, K, true);
    expect(revertOverride(ov, K, true)).toEqual({});
    const newer = setOverride(ov, K, false);
    expect(revertOverride(newer, K, true)).toBe(newer);
  });
});

describe('detail stabilization and viewed state', () => {
  it('returns a new detail when only a file viewed flag changed', () => {
    const a = { files: [{ path: 'a.rb', viewed: false }] };
    const b = { files: [{ path: 'a.rb', viewed: true }] };
    expect(keepIfSame(a, b)).toBe(b);
    expect(keepIfSame(a, { files: [{ path: 'a.rb', viewed: false }] })).toBe(a);
  });
});
