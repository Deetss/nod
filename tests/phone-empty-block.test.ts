// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyBlock } from '../web/phone/PhoneStates';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('EmptyBlock', () => {
  it('keeps its own sync line, since it is not a list row', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(createElement(EmptyBlock, { title: 'Nothing needs you', syncLine: 'Synced 2m ago · API 4,812 left', onRefresh: () => undefined })),
    );
    expect(host.querySelector('.ph-empty-sync')?.textContent).toBe('Synced 2m ago · API 4,812 left');
  });
});
