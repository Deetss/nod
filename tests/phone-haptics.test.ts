import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUZZ, buzz } from '../web/phone/haptics';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('haptic helper', () => {
  it('does nothing where the vibrate API is missing (iOS Safari, desktop)', () => {
    vi.stubGlobal('navigator', {});
    expect(() => buzz(BUZZ.tick)).not.toThrow();
  });

  it('stays silent before the page has had a tap', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate, userActivation: { hasBeenActive: false } });
    buzz(BUZZ.success);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrates for the given time once the page is active', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate, userActivation: { hasBeenActive: true } });
    buzz(BUZZ.success);
    buzz(BUZZ.tick);
    expect(vibrate.mock.calls).toEqual([[10], [5]]);
  });

  it('vibrates where user activation is not reported', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    buzz(BUZZ.tick);
    expect(vibrate).toHaveBeenCalledWith(5);
  });
});
