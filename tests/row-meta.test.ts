// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { RowMeta } from '../web/RowMeta';
import { formatMeta } from '../web/row-format';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const parts = { repo: 'acme-web', number: 7, author: 'build-bot', age: '2h' };

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(RowMeta, parts)));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('RowMeta', () => {
  it('reads the same as formatMeta', () => {
    expect(render().textContent).toBe('acme-web #7 · build-bot · 2h');
    expect(host!.textContent).toBe(formatMeta(parts));
  });

  it('wraps only the #number in one .row-num element', () => {
    const nums = render().querySelectorAll('.row-num');
    expect(nums).toHaveLength(1);
    expect(nums[0]?.textContent).toBe('#7');
  });
});
