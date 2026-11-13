import { useMemo, useState, type ReactNode } from 'react';

/** Sort keys for a multi-select picker. Fixed when the picker opens, so toggling never moves a row. */
export interface PickerOrder {
  /** Values checked when the picker opens (on every selected issue in bulk mode). */
  checked: ReadonlySet<string>;
  /** Bulk mode only: values on some but not all selected issues. */
  mixed?: ReadonlySet<string>;
}

export interface PickerItem {
  value: string;
  /** What the row shows after the checkbox. */
  node: ReactNode;
  /** Text matched by the filter box. */
  text: string;
}

export interface PickerStateOptions {
  items: PickerItem[];
  /** Values checked when the picker opens. */
  initial: ReadonlySet<string>;
  /** Single choice instead of a set. */
  single?: boolean;
  /** Single choice where a second tap on the chosen row keeps it chosen. */
  sticky?: boolean;
  loading?: boolean;
  error?: string;
  /** Labels only. Creates the item and rejects with the server message on failure. */
  create?: (name: string) => Promise<PickerItem>;
  /** Row order keys. Defaults to `initial` as checked and no mixed values. */
  ranked?: PickerOrder;
}

/** Checked rows first, mixed rows second, the rest last. Stable within each group. */
export function orderPickerItems(
  items: readonly PickerItem[],
  order: PickerOrder,
): PickerItem[] {
  const rank = (v: string) => (order.checked.has(v) ? 0 : order.mixed?.has(v) ? 1 : 2);
  return items
    .map((item, i) => ({ item, i, r: rank(item.value) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/**
 * Bulk order keys over the selected issues' values. A value is checked when it is on every
 * issue and mixed when it is on some but not all.
 */
export function bulkPickerOrder(valuesPerIssue: readonly (readonly string[])[]): PickerOrder {
  const count = new Map<string, number>();
  for (const values of valuesPerIssue) for (const v of new Set(values)) count.set(v, (count.get(v) ?? 0) + 1);
  const checked = new Set<string>();
  const mixed = new Set<string>();
  for (const [v, n] of count) {
    if (n === valuesPerIssue.length) checked.add(v);
    else mixed.add(v);
  }
  return { checked, mixed };
}

/** Number of values added plus removed against the start state. A single choice counts a swap once. */
export function changeCount(picked: ReadonlySet<string>, initial: ReadonlySet<string>, single?: boolean): number {
  const added = [...picked].filter((v) => !initial.has(v)).length;
  const removed = [...initial].filter((v) => !picked.has(v)).length;
  return single ? Math.max(added, removed) : added + removed;
}

/** Filter, checked set, create row and change count shared by the desktop and phone pickers. */
export function usePickerState(o: PickerStateOptions) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(o.initial));
  const [q, setQRaw] = useState('');
  const [focus, setFocus] = useState(0);
  const [made, setMade] = useState<PickerItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [announce, setAnnounce] = useState('');

  const all = useMemo(() => [...o.items, ...made.filter((m) => !o.items.some((i) => i.value === m.value))], [o.items, made]);
  const [order] = useState<PickerOrder>(() => o.ranked ?? { checked: new Set(o.initial) });
  // Multi-select only: a single choice keeps its list order.
  const ordered = useMemo(() => (o.single ? all : orderPickerItems(all, order)), [all, order, o.single]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? ordered.filter((i) => i.text.toLowerCase().includes(needle)) : ordered),
    [ordered, needle],
  );
  const showCreate = Boolean(o.create) && !o.loading && !o.error && needle !== '' && !all.some((i) => i.text.toLowerCase() === needle);
  const rows = shown.length + (showCreate ? 1 : 0);
  const createFocused = showCreate && focus === shown.length;
  const name = q.trim();

  const setQ = (v: string) => {
    setQRaw(v);
    setFocus(0);
    setCreateError(undefined);
  };

  const doCreate = async () => {
    if (!o.create || creating || !showCreate) return;
    setCreating(true);
    setCreateError(undefined);
    setAnnounce(`Creating label ${name}`);
    try {
      const item = await o.create(name);
      setMade((m) => [...m, item]);
      setPicked((s) => new Set(s).add(item.value));
      setQRaw('');
      const at = ordered.findIndex((i) => i.value === item.value);
      setFocus(at >= 0 ? at : ordered.length);
      setAnnounce(`Label ${item.text} created and selected`);
    } catch (e) {
      setCreateError(`Could not create label: ${e instanceof Error ? e.message : 'Request failed'}`);
      setAnnounce('');
    } finally {
      setCreating(false);
    }
  };

  const toggle = (value: string) =>
    setPicked((s) => {
      if (o.single) return o.sticky && s.has(value) ? s : new Set(s.has(value) ? [] : [value]);
      const n = new Set(s);
      if (n.has(value)) n.delete(value);
      else n.add(value);
      return n;
    });

  return {
    picked,
    q,
    setQ,
    focus,
    setFocus,
    shown,
    showCreate,
    rows,
    createFocused,
    name,
    creating,
    createError,
    announce,
    toggle,
    doCreate,
    changed: changeCount(picked, o.initial, o.single),
  };
}
