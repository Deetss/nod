// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS, CopyLinkButton, CopyLinkProvider, makeCopyUrl } from '../web/copy-link';
import { issueHelpKeys, HELP_KEYS } from '../web/keys';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { ToastInput } from '../web/toasts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const URL_OF_ITEM = 'https://github.com/acme-dev/notes/issues/12';

let root: Root | undefined;
let host: HTMLElement | undefined;
const writeText = vi.fn<(text: string) => Promise<void>>();

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

const flush = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

const withCopy = (push: (t: ToastInput) => void, node: ReturnType<typeof createElement>) =>
  createElement(CopyLinkProvider, { value: makeCopyUrl(push) }, node);

describe('Copy link button', () => {
  it('copies the url, toasts, shows a check, then goes back to the link glyph', async () => {
    const push = vi.fn();
    const el = render(withCopy(push, createElement(CopyLinkButton, { url: URL_OF_ITEM })));
    const btn = el.querySelector('button');
    expect(btn?.getAttribute('aria-label')).toBe('Copy link');

    act(() => btn?.click());
    await flush();

    expect(writeText).toHaveBeenCalledWith(URL_OF_ITEM);
    expect(push).toHaveBeenCalledWith({ kind: 'ok', message: 'Link copied', ms: 2000 });
    expect(btn?.classList.contains('is-copied')).toBe(true);
    expect(btn?.getAttribute('aria-label')).toBe('Link copied');

    act(() => void vi.advanceTimersByTime(COPIED_MS));
    expect(btn?.classList.contains('is-copied')).toBe(false);
  });

  it('toasts a failure and keeps the link glyph when the clipboard is blocked', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const push = vi.fn();
    const el = render(withCopy(push, createElement(CopyLinkButton, { url: URL_OF_ITEM })));
    const btn = el.querySelector('button');

    act(() => btn?.click());
    await flush();

    expect(push).toHaveBeenCalledWith({ kind: 'err', message: 'Could not copy link', ms: 2000 });
    expect(btn?.classList.contains('is-copied')).toBe(false);
  });

  it('does not let the click reach the row behind it', async () => {
    const onRow = vi.fn();
    const el = render(
      withCopy(
        vi.fn(),
        createElement('div', { onClick: onRow }, createElement(CopyLinkButton, { url: URL_OF_ITEM })),
      ),
    );
    act(() => el.querySelector('button')?.click());
    await flush();
    expect(onRow).not.toHaveBeenCalled();
  });

  it('renders nothing without a url or without the provider', () => {
    const noUrl = render(withCopy(vi.fn(), createElement(CopyLinkButton, { url: undefined })));
    expect(noUrl.querySelector('button')).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    const noProvider = render(createElement(CopyLinkButton, { url: URL_OF_ITEM }));
    expect(noProvider.querySelector('button')).toBeNull();
  });

  it('uses the header look for the header variant', () => {
    const el = render(withCopy(vi.fn(), createElement(CopyLinkButton, { url: URL_OF_ITEM, variant: 'header' })));
    expect(el.querySelector('button')?.className).toContain('copy-link-header');
  });
});

describe('Copy link key', () => {
  it('is listed as Y in the PR and issue help, and y stays Ready for review', () => {
    expect(HELP_KEYS.find((k) => k.keys === 'Y')?.label).toBe('copy link');
    expect(issueHelpKeys(DEFAULT_SETTINGS.bot).find((k) => k.keys === 'Y')?.label).toBe('copy link');
    expect(HELP_KEYS.find((k) => k.keys === 'y')?.label).toBe('ready for review');
  });
});
