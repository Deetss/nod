const PREFIX = 'NOD_';

/** Accepted for one release after the rename, with one deprecation line per name. */
const LEGACY_PREFIX = 'REVIEW_INBOX_';

const warned = new Set<string>();

/** `NOD_<name>`, falling back to the deprecated `REVIEW_INBOX_<name>`. */
export function appEnv(name: string, log: (line: string) => void = console.warn): string | undefined {
  const current = process.env[PREFIX + name];
  if (current !== undefined) return current;
  const legacy = process.env[LEGACY_PREFIX + name];
  if (legacy !== undefined && !warned.has(name)) {
    warned.add(name);
    log(`${LEGACY_PREFIX}${name} is deprecated; set ${PREFIX}${name} instead.`);
  }
  return legacy;
}
