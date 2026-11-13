/** One open layer on the phone, bottom to top: root sheet, diff sheet, action sheet, dialogs. */
export type Level =
  | { kind: 'pr'; id: string }
  | { kind: 'issue'; id: string }
  | { kind: 'diff'; path: string }
  | { kind: 'actions' }
  | { kind: 'confirm'; action: ConfirmKind }
  | { kind: 'composer'; mode: ComposerMode }
  | { kind: 'picker'; field: 'labels' | 'assignees' | 'milestone' }
  | { kind: 'edit-title' }
  | { kind: 'fix'; mode: FixMode }
  | { kind: 'fix-bot' }
  | { kind: 'bot-split' }
  | { kind: 'new-issue' }
  | { kind: 'sub-create' }
  | { kind: 'sub-row'; id: string }
  | { kind: 'sub-remove'; id: string }
  | { kind: 'form-picker'; field: 'repository' | 'labels' | 'assignees' };

export type FixMode = 'checks' | 'conflicts';
export type ConfirmKind = 'auto-merge' | 'admin-merge' | 'ready' | 'dispatch' | 'bot' | `fix-${FixMode}`;
export type ComposerMode = 'comment' | 'request' | 'description';

export type StackAction =
  | { type: 'push'; level: Level }
  | { type: 'replaceTop'; level: Level }
  | { type: 'replaceAll'; level: Level }
  | { type: 'pop' }
  | { type: 'truncate'; to: number };

export const isRoot = (l: Level) => l.kind === 'pr' || l.kind === 'issue';

/** Pure state machine for the sheet stack. Back, Close and swipe all end up as `pop` or `truncate`. */
export function stackReducer(stack: readonly Level[], a: StackAction): readonly Level[] {
  switch (a.type) {
    case 'push':
      // A new root starts a fresh stack; everything else stacks on top.
      return isRoot(a.level) ? [a.level] : [...stack, a.level];
    case 'replaceTop':
      return stack.length === 0 ? stack : [...stack.slice(0, -1), a.level];
    case 'replaceAll':
      return [a.level];
    case 'pop':
      return stack.slice(0, -1);
    case 'truncate':
      return a.to >= stack.length ? stack : stack.slice(0, Math.max(0, a.to));
  }
}

/** Layers open at a history entry (search, non-default tab). Back to an entry closes the layers above it. */
export function layersAfterBack(state: unknown): number {
  const n = (state as { phLayers?: unknown } | null)?.phLayers;
  return typeof n === 'number' && n >= 0 ? n : 0;
}

export const topLevel = (stack: readonly Level[]): Level | undefined => stack[stack.length - 1];
export const rootLevel = (stack: readonly Level[]): Level | undefined => stack[0];

/** History depth that a stack of this size should leave behind. Back to depth N keeps N levels. */
export function depthAfterBack(state: unknown): number {
  const d = (state as { phDepth?: unknown } | null)?.phDepth;
  return typeof d === 'number' && d >= 0 ? d : 0;
}
