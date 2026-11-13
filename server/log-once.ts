const LOG_INTERVAL_MS = 60_000;
const MAX_ENTRIES = 200;

/** Returns a logger that prints each distinct message to stderr at most once a minute. */
export function createLogOnce(): (message: string) => void {
  const logged = new Map<string, number>();
  return (message) => {
    const now = Date.now();
    if (now - (logged.get(message) ?? -Infinity) < LOG_INTERVAL_MS) return;
    if (logged.size >= MAX_ENTRIES) for (const [k, t] of logged) if (now - t >= LOG_INTERVAL_MS) logged.delete(k);
    logged.set(message, now);
    console.error(message);
  };
}
