// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html } from '../web/Markdown';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// GitHub's rendering of a fenced block with a language, and of an indented block.
const FENCED =
  '<div class="highlight highlight-source-ts notranslate position-relative overflow-auto" dir="auto">' +
  '<pre><span class="pl-k">const</span> a <span class="pl-c1">=</span> 1;\n  <span class="pl-en">run</span>(a);</pre></div>';
const INDENTED = '<div class="snippet-clipboard-content notranslate"><pre class="notranslate"><code>indented &lt;x&gt;\n  two</code></pre></div>';
const INLINE = '<p>Use <code>pnpm test</code> here.</p>';

describe('Html code copy button', () => {
  let root: Root | undefined;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  function render(html: string): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(Html, { html })));
    return host;
  }

  const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button.md-code-copy')];
  const first = (host: HTMLElement) => {
    const b = buttons(host)[0];
    if (!b) throw new Error('no copy button');
    return b;
  };

  it('adds a labelled button to fenced and indented blocks', () => {
    const host = render(FENCED + INDENTED);
    const found = buttons(host);
    expect(found).toHaveLength(2);
    for (const b of found) {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-label')).toBe('Copy code');
      expect(b.closest('.md-code')?.querySelector('pre')).not.toBeNull();
      expect(b.closest('pre')).toBeNull();
    }
  });

  it('leaves inline code alone', () => {
    expect(buttons(render(INLINE))).toHaveLength(0);
  });

  it.each([
    ['fenced', FENCED, 'const a = 1;\n  run(a);'],
    ['indented', INDENTED, 'indented <x>\n  two'],
  ])('copies the exact text of a %s block', async (_kind, html, text) => {
    const button = first(render(html));
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith(text);
  });

  it('shows Copied for 1.5 seconds', async () => {
    vi.useFakeTimers();
    const button = first(render(FENCED));
    await act(async () => button.click());
    expect(button.textContent).toBe('Copied');
    act(() => vi.advanceTimersByTime(1400));
    expect(button.textContent).toBe('Copied');
    act(() => vi.advanceTimersByTime(200));
    expect(button.textContent).toBe('');
  });

  it('says so when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const button = first(render(FENCED));
    await act(async () => button.click());
    expect(button.textContent).toBe('Copy failed');
  });

  it('rebuilds buttons when the markdown changes', () => {
    const host = render(FENCED);
    act(() => root!.render(createElement(Html, { html: FENCED + INDENTED + INLINE })));
    expect(buttons(host)).toHaveLength(2);
  });
});
