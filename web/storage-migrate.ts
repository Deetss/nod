const LEGACY_PREFIX = 'review-inbox-';
const PREFIX = 'nod-';

/** Copies saved preferences from their pre-rename keys once. The old keys stay, and a key already set wins. */
export function migrateStorageKeys(storage: Storage = window.localStorage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    for (const old of keys) {
      if (!old?.startsWith(LEGACY_PREFIX)) continue;
      const next = PREFIX + old.slice(LEGACY_PREFIX.length);
      const value = storage.getItem(old);
      if (value !== null && storage.getItem(next) === null) storage.setItem(next, value);
    }
  } catch {
    // storage blocked: the defaults apply
  }
}
