/** A file the user asked to navigate to. `n` increases with every request. */
export interface FileTarget {
  path: string;
  n: number;
}

/** Resolve a request to a path by its stable path, never a list index. */
export function resolveTarget(files: readonly { path: string }[], path: string): string | undefined {
  return files.some((f) => f.path === path) ? path : undefined;
}

/** Sequence counter. Only the latest request may scroll. */
export function makeSequence() {
  let n = 0;
  return {
    begin: () => ++n,
    isLatest: (id: number) => id === n,
  };
}

/** Everything goToFile needs from the DOM and React state, so tests can fake it. */
export interface NavAdapter {
  isExpanded(path: string): boolean;
  expand(path: string): void;
  /** Resolves true once the file's block is rendered open, false if it will never be (not in this diff). */
  whenRendered(path: string): Promise<boolean>;
  nextFrame(): Promise<void>;
  scrollToHeader(path: string): void;
  markCurrent(path: string): void;
  flash(path: string): void;
}

/**
 * Ordered steps: mark current, expand if collapsed, wait for the render, let layout
 * settle (two frames), scroll the header to the top, flash it. A newer request
 * abandons this one at every await.
 */
export async function goToFile(
  a: NavAdapter,
  seq: ReturnType<typeof makeSequence>,
  path: string,
): Promise<boolean> {
  const id = seq.begin();
  a.markCurrent(path);
  if (!a.isExpanded(path)) a.expand(path);
  const rendered = await a.whenRendered(path);
  if (!seq.isLatest(id) || !rendered) return false;
  await a.nextFrame();
  await a.nextFrame();
  if (!seq.isLatest(id)) return false;
  a.scrollToHeader(path);
  a.flash(path);
  return true;
}

/** Scroll offset that puts a header at the top of its scroller. */
export function headerScrollTop(scrollTop: number, headerTop: number, rootTop: number): number {
  return scrollTop + (headerTop - rootTop);
}
