const WRAP_KEY = 'nod-diff-wrap';

/** Remembered Wrap toggle. Storage can be blocked, so failures fall back to no wrap. */
export function loadWrap(): boolean {
  try {
    return window.localStorage.getItem(WRAP_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveWrap(on: boolean): void {
  try {
    window.localStorage.setItem(WRAP_KEY, on ? '1' : '0');
  } catch {
    // Not persisted; the toggle still works for this session.
  }
}
