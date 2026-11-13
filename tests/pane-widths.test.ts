import { describe, expect, it } from 'vitest';
import { clampWidth, fitWidths, parseWidths, resetWidths } from '../web/pane-widths';

describe('clampWidth', () => {
  it('stops Inbox at its 280 minimum', () => {
    expect(clampWidth('three', [560, 440], 0, 100, 1920)).toEqual([280, 440]);
  });

  it('stops Detail at its 360 minimum', () => {
    expect(clampWidth('three', [560, 440], 1, 100, 1920)).toEqual([560, 360]);
  });

  it('keeps 480 for Diff when Inbox grows', () => {
    // 1920 - 2 handles - 480 - Detail 440 = 998
    expect(clampWidth('three', [560, 440], 0, 5000, 1920)).toEqual([998, 440]);
  });

  it('keeps 480 for Review at two panes', () => {
    expect(clampWidth('two', [300], 0, 5000, 960)).toEqual([479]);
  });

  it('passes an in-range value through', () => {
    expect(clampWidth('three', [560, 440], 0, 420, 1920)).toEqual([420, 440]);
  });
});

describe('fitWidths', () => {
  it('leaves widths alone when they fit', () => {
    expect(fitWidths('three', [560, 440], 1920)).toEqual([560, 440]);
  });

  it('shrinks Detail before Inbox', () => {
    // budget 1400 - 2 - 480 = 918; Detail gives 80 to its minimum, Inbox gives the last 2
    expect(fitWidths('three', [560, 440], 1400)).toEqual([558, 360]);
  });

  it('never goes below the minimums', () => {
    expect(fitWidths('three', [560, 440], 900)).toEqual([280, 360]);
  });
});

describe('reset and parse', () => {
  it('resets to spec widths', () => {
    expect(resetWidths('three')).toEqual([400, 480]);
    expect(resetWidths('two')).toEqual([300]);
  });

  it('sizes Issues detail so the sidebar is 340 at 1920', () => {
    // 1920 - 2 handles - list 420 - sidebar 340
    expect(resetWidths('issues', 1920)).toEqual([420, 1158]);
  });

  it('drops missing, malformed or wrong-length storage', () => {
    expect(parseWidths('three', null)).toBeNull();
    expect(parseWidths('three', 'nope')).toBeNull();
    expect(parseWidths('three', '[1]')).toBeNull();
    expect(parseWidths('three', '["400",480]')).toBeNull();
  });

  it('drops stored widths below a minimum or above the sane maximum', () => {
    expect(parseWidths('three', '[420,300]')).toBeNull();
    expect(parseWidths('three', '[420,99999]')).toBeNull();
    expect(parseWidths('three', '[-1,480]')).toBeNull();
  });

  it('reads a valid saved value as is', () => {
    expect(parseWidths('three', '[420,360]')).toEqual([420, 360]);
  });
});
