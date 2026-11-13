// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ExpandToggle } from '../web/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function Probe() {
  const [open, setOpen] = useState(false);
  return createElement(ExpandToggle, { open, controls: 'region', onToggle: () => setOpen((o) => !o) });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('ExpandToggle', () => {
  it('is a shared-class button that toggles aria-expanded and its label', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(createElement(Probe)));

    const btn = host.querySelector('button') as HTMLButtonElement;
    expect(btn.type).toBe('button');
    expect(btn.classList.contains('expand-toggle')).toBe(true);
    expect(btn.getAttribute('aria-controls')).toBe('region');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toBe('Show full description');
    expect(btn.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    act(() => btn.click());
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toBe('Hide full description');

    act(() => btn.click());
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toBe('Show full description');
  });

  it('both screens use the shared control, not a local button', () => {
    const detail = readFileSync('web/DetailBody.tsx', 'utf8');
    const phone = readFileSync('web/phone/PhoneIssueSheet.tsx', 'utf8');
    expect(detail).toContain('<ExpandToggle');
    expect(phone).toContain('<ExpandToggle');
  });
});
