import {
  DEV_BUILD,
  reloadDecision,
  reloadKey,
  reloadUrl,
  type OpenRef,
  type UpdateSignal,
} from '../shared/build-update';

/** This page's build, injected by vite. */
export const CLIENT_BUILD = typeof __NOD_BUILD__ === 'string' ? __NOD_BUILD__ : DEV_BUILD;

/** The "Nod updated" toast shows this long before the page reloads. */
export const RELOAD_DELAY_MS = 1200;

const RELOADED_KEY = 'nod.reloadedFor';

export type UpdateNotice = 'updated' | 'ready';

/** True while any comment box on the page holds text that has not been sent. */
export function hasUnsentDraft(root: ParentNode = document): boolean {
  return [...root.querySelectorAll('textarea')].some((t) => t.value.trim() !== '');
}

export function parseSignal(kind: string, data: string): UpdateSignal | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { build, nonce } = raw as Record<string, unknown>;
  if (typeof build !== 'string') return undefined;
  if (kind === 'build') return { kind, build };
  if (kind === 'reload' && typeof nonce === 'string' && nonce) return { kind, build, nonce };
  return undefined;
}

type SessionLike = Pick<Storage, 'getItem' | 'setItem'>;

function readReloaded(session: SessionLike): Set<string> {
  try {
    const list = JSON.parse(session.getItem(RELOADED_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

function markReloaded(session: SessionLike, key: string): void {
  try {
    session.setItem(RELOADED_KEY, JSON.stringify([...readReloaded(session), key].slice(-20)));
  } catch {
    // storage blocked: the reload still happens, without the loop guard
  }
}

export interface WatcherDeps {
  client: string;
  session: SessionLike;
  hasDraft: () => boolean;
  /** The PR or issue on screen, kept across the reload. */
  currentOpen: () => OpenRef | undefined;
  location: () => { pathname: string; search: string };
  navigate: (url: string) => void;
  show: (notice: UpdateNotice | undefined) => void;
  later: (fn: () => void, ms: number) => void;
}

/**
 * Turns update signals into a reload: at most once per build (or per "Update phones" press) per
 * tab, and never over an unsent comment, which gets "Update ready, tap to reload" instead.
 */
export function createUpdateWatcher(deps: WatcherDeps) {
  let pending: string | undefined;
  const go = (key: string) => {
    markReloaded(deps.session, key);
    deps.navigate(reloadUrl(deps.location(), deps.currentOpen()));
  };
  return {
    onSignal(signal: UpdateSignal): void {
      const decision = reloadDecision({
        signal,
        client: deps.client,
        reloaded: readReloaded(deps.session),
        draft: deps.hasDraft(),
      });
      const key = reloadKey(signal, deps.client);
      if (decision === 'none' || !key) return;
      if (decision === 'prompt') {
        pending = key;
        deps.show('ready');
        return;
      }
      pending = undefined;
      deps.show('updated');
      deps.later(() => go(key), RELOAD_DELAY_MS);
    },
    /** The tap on "Update ready". */
    reloadNow(): void {
      if (pending) go(pending);
    },
  };
}
