export const BUZZ = { success: 10, tick: 5 } as const;

/** Vibrates where Android Chrome allows it: the API exists and the page has had a tap. */
export function buzz(ms: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  if (typeof nav.vibrate !== 'function') return;
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
  nav.vibrate(ms);
}
