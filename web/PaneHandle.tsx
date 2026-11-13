import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const STEP = 16;

interface PaneHandleProps {
  label: string;
  /** Current width of the pane to the left of the handle. */
  value: number;
  min: number;
  max: number;
  onResize: (px: number) => void;
  onReset: () => void;
}

/** Vertical drag handle between two panes. 1px line, 8px hit area. */
export function PaneHandle({ label, value, min, max, onResize, onReset }: PaneHandleProps) {
  const start = useRef<{ x: number; width: number }>(undefined);
  const [dragging, setDragging] = useState(false);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    start.current = { x: e.clientX, width: value };
    setDragging(true);
    document.body.classList.add('pane-resizing');
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) onResize(start.current.width + e.clientX - start.current.x);
  };

  const end = () => {
    start.current = undefined;
    setDragging(false);
    document.body.classList.remove('pane-resizing');
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') onResize(value - STEP);
    else if (e.key === 'ArrowRight') onResize(value + STEP);
    else if (e.key === 'Home') onReset();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`pane-handle${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  );
}
