import { installedApk } from './apk-version';

type Handler = (data: string) => void;

/** One `/api/events` stream per page, shared by the inbox and the update watcher. */
let source: EventSource | undefined;
const handlers = new Map<string, Set<Handler>>();

function eventsUrl(): string {
  const apk = installedApk();
  return apk ? `/api/events?apk=${apk}` : '/api/events';
}

function open(): EventSource {
  const es = new EventSource(eventsUrl());
  for (const name of handlers.keys()) listen(es, name);
  return es;
}

function listen(es: EventSource, name: string): void {
  es.addEventListener(name, (e) => {
    for (const fn of handlers.get(name) ?? []) fn((e as MessageEvent<string>).data);
  });
}

/** Calls `fn` with the data of each `name` event. Returns the unsubscribe. */
export function onLiveEvent(name: string, fn: Handler): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
    if (source) listen(source, name);
  }
  set.add(fn);
  source ??= open();
  return () => {
    set.delete(fn);
    if ([...handlers.values()].some((s) => s.size > 0)) return;
    source?.close();
    source = undefined;
    handlers.clear();
  };
}
