// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSheetStack, type SheetStack } from '../web/phone/useSheetStack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let sheets: SheetStack | undefined;

function Probe() {
  sheets = useSheetStack([]);
  return null;
}

function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Probe)));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe('replaceRoot', () => {
  it('swaps the stack for one root and steps history back to depth 1', () => {
    mount();
    act(() => sheets?.push({ kind: 'issue', id: 'I_42' }));
    act(() => sheets?.push({ kind: 'actions' }));
    act(() => sheets?.replaceTop({ kind: 'new-issue' }));
    act(() => sheets?.push({ kind: 'form-picker', field: 'labels' }));
    act(() => sheets?.pop());
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const depth = (window.history.state as { phDepth: number }).phDepth;
    act(() => sheets?.replaceRoot({ kind: 'issue', id: 'I_43' }));
    expect(sheets?.stack).toEqual([{ kind: 'issue', id: 'I_43' }]);
    expect(go).toHaveBeenCalledWith(1 - depth);
  });

  it('leaves history alone when the stack is already one deep', () => {
    mount();
    act(() => sheets?.push({ kind: 'issue', id: 'I_42' }));
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    act(() => sheets?.replaceRoot({ kind: 'issue', id: 'I_43' }));
    expect(go).not.toHaveBeenCalled();
    expect(sheets?.stack).toEqual([{ kind: 'issue', id: 'I_43' }]);
  });
});
