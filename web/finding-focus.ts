import { useSyncExternalStore } from 'react';

let focused = false;
const listeners = new Set<() => void>();

/** Set by the finding list while a card inside it has focus, so the footer can show the finding keys. */
export function setFindingFocus(on: boolean): void {
  if (on === focused) return;
  focused = on;
  listeners.forEach((l) => l());
}

export function useFindingFocus(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => focused,
    () => false,
  );
}
