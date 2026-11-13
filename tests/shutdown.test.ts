import { describe, expect, it, vi } from 'vitest';
import { createSignalHandler } from '../electron/shutdown';

describe('createSignalHandler', () => {
  it('marks quitting and calls app.quit once on the first signal', () => {
    const app = { quit: vi.fn(), exit: vi.fn() };
    const onQuit = vi.fn();
    createSignalHandler(app, onQuit)();
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.exit).not.toHaveBeenCalled();
  });

  it('exits on a second signal without quitting again', () => {
    const app = { quit: vi.fn(), exit: vi.fn() };
    const handler = createSignalHandler(app, vi.fn());
    handler();
    handler();
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.exit).toHaveBeenCalledWith(0);
  });
});
