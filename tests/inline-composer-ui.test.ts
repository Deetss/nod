// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '../web/inline/Composer';
import { composerReducer, type ComposerState } from '../web/inline/composer-state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const openLine: ComposerState = composerReducer(
  { status: 'closed', text: '', drafts: {} },
  { type: 'open', target: { subject: 'line', path: 'src/a.ts', side: 'RIGHT', line: 40 } },
);

function mount(state: ComposerState, onSubmit = vi.fn(), dispatch = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(Composer, {
        state,
        dispatch,
        onSubmit,
        repo: 'acme-co/acme-api',
        hasPendingReview: false,
      }),
    ),
  );
  return { onSubmit, dispatch };
}

describe('Composer', () => {
  it('shows the line header and the icon toolbar with labels only on the buttons', () => {
    mount({ ...openLine, text: '' });
    expect(host?.textContent).toContain('Add comment on line 40');
    const labels = [...(host?.querySelectorAll('.composer-tools button') ?? [])].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Heading',
      'Bold',
      'Italic',
      'Quote',
      'Code',
      'Link',
      'Bulleted list',
      'Numbered list',
      'Task list',
      'Mention',
      'Reference',
      'Undo',
    ]);
  });

  it('shows the file-level header and the disabled upload line', () => {
    mount({ status: 'open', target: { subject: 'file', path: 'src/a.ts' }, text: '', drafts: {} });
    expect(host?.textContent).toContain('Add comment on file');
    expect(host?.textContent).toContain('Paste, drop, or click to add files');
    expect(host?.querySelector('.ic-files')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('Ctrl+Enter posts the text and Ctrl+Shift+Enter adds a draft', () => {
    const { onSubmit } = mount({ ...openLine, text: 'hello' });
    const box = host?.querySelector('.inline-composer') as HTMLElement;
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    expect(onSubmit).toHaveBeenLastCalledWith(false);
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true }));
    });
    expect(onSubmit).toHaveBeenLastCalledWith(true);
  });

  it('Esc closes the composer through the reducer', () => {
    const { dispatch } = mount({ ...openLine, text: 'keep me' });
    const box = host?.querySelector('.inline-composer') as HTMLElement;
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
  });

  it('a blank comment does not post', () => {
    const { onSubmit } = mount({ ...openLine, text: '   ' });
    const box = host?.querySelector('.inline-composer') as HTMLElement;
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a failed post shows Not posted with the message and offers Retry', () => {
    mount({ ...openLine, status: 'failed', text: 'body', error: '422: refused' });
    expect(host?.textContent).toContain('Not posted');
    expect(host?.textContent).toContain('422: refused');
    const primary = host?.querySelector('.btn-primary') as HTMLButtonElement;
    expect(primary.textContent).toBe('Retry');
    expect(primary.disabled).toBe(false);
  });

  it('a posting comment shows Posting... and disables Comment', () => {
    mount({ ...openLine, status: 'posting', text: 'body' });
    expect(host?.textContent).toContain('Posting comment');
    const primary = host?.querySelector('.btn-primary') as HTMLButtonElement;
    expect(primary.textContent).toBe('Posting...');
    expect(primary.disabled).toBe(true);
  });
});
