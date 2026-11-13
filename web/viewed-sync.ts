/** Optimistic "Viewed" marks and the ordered writer that sends them to GitHub. */

/** How long a confirmed mark outlives the write while the server data still disagrees. */
export const SETTLED_TTL_MS = 60_000;
export const RETRY_DELAY_MS = 600;

export interface ViewedOverride {
  value: boolean;
  /** Set when GitHub accepted the write. Unset while the write is queued or in flight. */
  settledAt?: number;
}

export type ViewedOverrides = Record<string, ViewedOverride>;

export const viewedKey = (prId: string, path: string) => `${prId}:${path}`;

/** A local toggle replaces any earlier mark for the file and is pending again. */
export function setOverride(ov: ViewedOverrides, key: string, value: boolean): ViewedOverrides {
  return { ...ov, [key]: { value } };
}

/** Marks the write confirmed, unless the user has toggled again since. */
export function settleOverride(ov: ViewedOverrides, key: string, value: boolean, now: number): ViewedOverrides {
  const cur = ov[key];
  if (!cur || cur.value !== value || cur.settledAt !== undefined) return ov;
  return { ...ov, [key]: { value, settledAt: now } };
}

/** Drops a mark whose write failed, so the file shows the server value again. A newer toggle is kept. */
export function revertOverride(ov: ViewedOverrides, key: string, value: boolean): ViewedOverrides {
  const cur = ov[key];
  if (!cur || cur.value !== value) return ov;
  const { [key]: _gone, ...rest } = ov;
  return rest;
}

/**
 * Drops marks the server data has caught up with, and confirmed marks older than the TTL.
 * A pending mark is never dropped, so a refetch that predates the write cannot undo it.
 * `server` returns the file's viewed state in the loaded detail, or undefined if it is not loaded.
 */
export function reconcileOverrides(
  ov: ViewedOverrides,
  server: (key: string) => boolean | undefined,
  now: number,
): ViewedOverrides {
  let out: ViewedOverrides | undefined;
  for (const [key, o] of Object.entries(ov)) {
    if (o.settledAt === undefined) continue;
    if (server(key) === o.value || now - o.settledAt > SETTLED_TTL_MS) {
      out ??= { ...ov };
      delete out[key];
    }
  }
  return out ?? ov;
}

export function applyOverride(ov: ViewedOverrides, key: string, serverViewed: boolean): boolean {
  return ov[key]?.value ?? serverViewed;
}

export interface WriteResult {
  ok: boolean;
  message: string;
}

export interface ViewedWriterOptions {
  send: (prId: string, path: string, viewed: boolean) => Promise<WriteResult>;
  onSettled: (key: string, viewed: boolean) => void;
  onFailed: (key: string, viewed: boolean, message: string) => void;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface Slot {
  prId: string;
  path: string;
  desired: boolean;
}

/**
 * Sends viewed flips one at a time per PR and file. A toggle made while a request is in
 * flight replaces the wanted value, so the last click is the last write and the ones in
 * between are skipped. Each send is retried once. Only a failure of the latest wanted
 * value is reported.
 */
export class ViewedWriter {
  private readonly pending = new Map<string, Slot>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly opts: ViewedWriterOptions) {}

  write(prId: string, path: string, viewed: boolean): void {
    const key = viewedKey(prId, path);
    this.pending.set(key, { prId, path, desired: viewed });
    if (!this.running.has(key)) {
      const run = this.drain(key).finally(() => this.running.delete(key));
      this.running.set(key, run);
    }
  }

  /** Resolves when every queued write has finished. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running.values()]);
  }

  private async drain(key: string): Promise<void> {
    for (;;) {
      const slot = this.pending.get(key);
      if (!slot) return;
      const value = slot.desired;
      const res = await this.attempt(slot.prId, slot.path, value);
      if (this.pending.get(key)?.desired !== value) continue;
      this.pending.delete(key);
      if (res.ok) this.opts.onSettled(key, value);
      else this.opts.onFailed(key, value, res.message);
      return;
    }
  }

  private async attempt(prId: string, path: string, viewed: boolean): Promise<WriteResult> {
    const once = () =>
      this.opts.send(prId, path, viewed).catch(
        (e: unknown): WriteResult => ({
          ok: false,
          message: e instanceof Error ? e.message : 'Could not save viewed state',
        }),
      );
    const first = await once();
    if (first.ok || this.pending.get(viewedKey(prId, path))?.desired !== viewed) return first;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    await sleep(this.opts.retryDelayMs ?? RETRY_DELAY_MS);
    return once();
  }
}
