const KEY = 'nod-phone-open';

/** Section open or closed choices, by section key. A missing key takes the section's default. */
export function loadOpen(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveOpen(open: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(open));
  } catch {
    // storage unavailable; the choice lasts for this session only
  }
}
