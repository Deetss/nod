// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Html } from '../web/Markdown';
import { LinkRouterContext, isKnownRepo, parseItemLink, type ItemLink } from '../web/links';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('parseItemLink', () => {
  it.each([
    ['https://github.com/acme/acme-api/issues/116', { kind: 'issue', owner: 'acme', repo: 'acme-api', number: 116 }],
    ['https://github.com/acme/acme-api/pull/12', { kind: 'pr', owner: 'acme', repo: 'acme-api', number: 12 }],
    ['https://github.com/acme/acme-api/pull/12/files', { kind: 'pr', owner: 'acme', repo: 'acme-api', number: 12 }],
    ['https://github.com/other/acme-api/issues/7#issuecomment-1', { kind: 'issue', owner: 'other', repo: 'acme-api', number: 7 }],
  ])('parses %s', (href, want) => {
    expect(parseItemLink(href)).toEqual(want);
  });

  it.each([
    'https://example.com/acme/acme-api/issues/1',
    'https://github.com/acme/acme-api/blob/main/a.ts',
    'https://github.com/acme/acme-api/issues/abc',
    'not a url',
    '',
  ])('rejects %s', (href) => {
    expect(parseItemLink(href)).toBeUndefined();
  });
});

describe('isKnownRepo', () => {
  const urls = ['https://github.com/acme/acme-api/pull/12'];
  const link = (owner: string, repo: string): ItemLink => ({ kind: 'issue', owner, repo, number: 1 });

  it('matches the owner and repo', () => {
    expect(isKnownRepo(link('acme', 'acme-api'), urls)).toBe(true);
  });

  it('ignores case', () => {
    expect(isKnownRepo(link('ACME', 'acme-api'), urls)).toBe(true);
  });

  it('rejects another owner with the same repo name', () => {
    expect(isKnownRepo(link('other', 'acme-api'), urls)).toBe(false);
  });
});

describe('Html link routing', () => {
  let root: Root | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  async function click(href: string, init: MouseEventInit = {}, known = true) {
    const opened: ItemLink[] = [];
    const route = (l: ItemLink) => {
      opened.push(l);
      return known && l.repo === 'acme-api' && (l.kind === 'issue' || l.number === 12);
    };
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        createElement(
          LinkRouterContext.Provider,
          { value: route },
          createElement(Html, { html: `<p><a href="${href}">x</a></p>` }),
        ),
      );
    });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    await act(async () => {
      host.querySelector('a')?.dispatchEvent(ev);
    });
    return { ev, opened };
  }

  it('opens a known issue in the app', async () => {
    const { ev, opened } = await click('https://github.com/acme/acme-api/issues/116');
    expect(opened).toEqual([{ kind: 'issue', owner: 'acme', repo: 'acme-api', number: 116 }]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('opens a PR in the list in the app', async () => {
    const { ev } = await click('https://github.com/acme/acme-api/pull/12');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('leaves an unknown repo to GitHub', async () => {
    const { ev } = await click('https://github.com/acme/other/issues/1');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('leaves a PR not in the list to GitHub', async () => {
    const { ev } = await click('https://github.com/acme/acme-api/pull/99');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('leaves a ctrl-click to GitHub', async () => {
    const { ev, opened } = await click('https://github.com/acme/acme-api/issues/116', { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(opened).toEqual([]);
  });

  it('leaves a middle click to GitHub', async () => {
    const { ev } = await click('https://github.com/acme/acme-api/issues/116', { button: 1 });
    expect(ev.defaultPrevented).toBe(false);
  });
});
