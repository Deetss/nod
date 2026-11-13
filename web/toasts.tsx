import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, InfoIcon, ToastIcon } from './ui';

export type ToastKind = 'ok' | 'neutral' | 'warn' | 'err';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** A button in the toast, e.g. `Choose`. */
  action?: { label: string; onClick: () => void };
  /** How long it stays, ms. */
  ms: number;
}

export type ToastInput = Omit<ToastItem, 'id' | 'ms'> & { ms?: number };

/** Two toasts at most: the action's own and the Orca notification above it. */
export const TOAST_STACK_MAX = 2;
export const TOAST_MS = 5000;
export const TOAST_LONG_MS = 8000;

/** A stack of up to two toasts, oldest at the bottom. Each leaves on its own timer. */
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((all) => all.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      next.current += 1;
      const id = next.current;
      const item: ToastItem = { ...t, id, ms: t.ms ?? (t.kind === 'warn' || t.kind === 'err' ? TOAST_LONG_MS : TOAST_MS) };
      setItems((all) => [...all, item].slice(-TOAST_STACK_MAX));
      timers.current.set(id, setTimeout(() => dismiss(id), item.ms));
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    [],
  );

  return { items, push, dismiss };
}

function Icon({ kind }: { kind: ToastKind }) {
  if (kind === 'ok') return <ToastIcon ok />;
  if (kind === 'err') return <ToastIcon ok={false} />;
  return (
    <span className={`toast-icon toast-icon-${kind}`}>{kind === 'warn' ? <AlertIcon size={16} /> : <InfoIcon size={16} />}</span>
  );
}

const CLASS: Record<ToastKind, string> = {
  ok: 'toast',
  neutral: 'toast toast-action',
  warn: 'toast toast-action toast-warn',
  err: 'toast toast-error',
};

/** The toast stack. Newest sits on top; `raised` lifts it above a toast another view draws at the corner. */
export function ToastStack({ items, raised = false }: { items: readonly ToastItem[]; raised?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className={`toast-stack${raised ? ' toast-stack-raised' : ''}`}>
      {items.map((t) => (
        <div key={t.id} className={`${CLASS[t.kind]}${t.action ? ' toast-action' : ''}`} role="status">
          <Icon kind={t.kind} />
          <span>{t.message}</span>
          {t.action ? (
            <button type="button" className="btn" onClick={t.action.onClick}>
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
