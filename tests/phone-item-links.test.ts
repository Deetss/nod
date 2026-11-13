// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Html } from '../web/Markdown';
import { LinkRouterContext, resolveItemLink, type ItemLink } from '../web/links';
import { phoneLinkRouter } from '../web/phone/link-router';
import type { Level } from '../web/phone/sheet-stack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prs = [{ id: 'pr-12', url: 'https://github.com/acme/acme-api/pull/12' }];
const issues = [{ id: 'issue-116', url: 'https://github.com/acme/acme-api/issues/116' }];
const link = (kind: 'issue' | 'pr', owner: string, number: number): ItemLink => ({ kind, owner, repo: 'acme-api', number });

describe('resolveItemLink', () => {
  it('finds a known issue', () => {
    expect(resolveItemLink(link('issue', 'acme', 116), issues)).toBe(issues[0]);
  });

  it('finds a known PR', () => {
    expect(resolveItemLink(link('pr', 'acme', 12), prs)).toBe(prs[0]);
  });

  it('returns undefined for another owner', () => {
    expect(resolveItemLink(link('issue', 'other', 116), issues)).toBeUndefined();
  });

  it('returns undefined for an unloaded number', () => {
    expect(resolveItemLink(link('issue', 'acme', 999), issues)).toBeUndefined();
  });

  it('returns undefined for a non-item URL', () => {
    const items = [{ id: 'x', url: 'https://github.com/acme/acme-api' }];
    expect(resolveItemLink(link('issue', 'acme', 1), items)).toBeUndefined();
  });
});

describe('phone link routing in Html', () => {
  let root: Root | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  async function tap(href: string) {
    const pushed: Level[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        createElement(
          LinkRouterContext.Provider,
          { value: phoneLinkRouter(prs, issues, (l) => pushed.push(l)) },
          createElement(Html, { html: `<p><a href="${href}">x</a></p>` }),
        ),
      );
    });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    await act(async () => {
      host.querySelector('a')?.dispatchEvent(ev);
    });
    return { ev, pushed };
  }

  it('pushes the issue sheet for a loaded issue', async () => {
    const { ev, pushed } = await tap('https://github.com/acme/acme-api/issues/116');
    expect(pushed).toEqual([{ kind: 'issue', id: 'issue-116' }]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('pushes the PR sheet for a loaded PR', async () => {
    const { ev, pushed } = await tap('https://github.com/acme/acme-api/pull/12');
    expect(pushed).toEqual([{ kind: 'pr', id: 'pr-12' }]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('leaves an unloaded issue to GitHub', async () => {
    const { ev, pushed } = await tap('https://github.com/acme/acme-api/issues/999');
    expect(pushed).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });
});
