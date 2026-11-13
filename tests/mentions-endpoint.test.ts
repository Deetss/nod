// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { mentionablePage, MENTIONABLE_QUERY } from '../server/mentionable';
import type { PrRef } from '../server/provider';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { MentionTextarea } from '../web/mentions/MentionTextarea';
import { clearMentionCache } from '../web/mentions/useRepoPeople';
import { TEST_SETTINGS } from './bot-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('mentionablePage', () => {
  it('maps nodes and paging, with no avatar key when absent', () => {
    const page = mentionablePage('acme-co/acme-web', {
      repository: {
        mentionableUsers: {
          nodes: [{ login: 'riley-k', avatarUrl: 'https://avatars.example/1' }, { login: 'sam-lee', avatarUrl: null }],
          pageInfo: { hasNextPage: true, endCursor: 'Y3Vyc29y' },
        },
      },
    });
    expect(page).toEqual({
      repo: 'acme-co/acme-web',
      people: [{ login: 'riley-k', avatarUrl: 'https://avatars.example/1' }, { login: 'sam-lee' }],
      hasNextPage: true,
      endCursor: 'Y3Vyc29y',
    });
  });

  it('a missing repository has no people and no next page', () => {
    expect(mentionablePage('acme-co/gone', { repository: null })).toEqual({ repo: 'acme-co/gone', people: [], hasNextPage: false });
  });

  it('queries mentionableUsers with 100 per page', () => {
    expect(MENTIONABLE_QUERY).toContain('mentionableUsers(first: 100, after: $cursor)');
  });
});

describe('GET /api/mentionable', () => {
  it('serves the fixture list for any owner/name', async () => {
    const app = createApp({ provider: new FixtureProvider(TEST_SETTINGS), port: 4478, token: 't', settings: DEFAULT_SETTINGS });
    const res = await app.request('http://127.0.0.1:4478/api/mentionable/acme-co/acme-web', { headers: { host: '127.0.0.1:4478' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { people: { login: string }[]; hasNextPage: boolean };
    expect(body.people.map((p) => p.login)).toEqual(['riley-k', 'sam-lee', 'jordan-q', 'acme-dev']);
    expect(body.hasNextPage).toBe(false);
  });

  it('refuses a bad repo and a bad cursor', async () => {
    const app = createApp({ provider: new FixtureProvider(TEST_SETTINGS), port: 4478, token: 't', settings: DEFAULT_SETTINGS });
    const headers = { host: '127.0.0.1:4478', origin: 'http://127.0.0.1:4478', 'x-nod-token': 't' };
    expect((await app.request('http://127.0.0.1:4478/api/mentionable/acme%20co/acme-web', { headers })).status).toBe(400);
    expect((await app.request('http://127.0.0.1:4478/api/mentionable/acme-co/acme-web?cursor=a%20b', { headers })).status).toBe(400);
  });
});

describe('MentionTextarea keys', () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    clearMentionCache();
  });

  function mount(value: string, onValueChange = vi.fn()) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(MentionTextarea, {
          value,
          onValueChange,
          repo: 'acme-co/acme-web',
          people: [{ kind: 'person', login: 'riley-k', reason: 'author' }],
          'aria-label': 'Comment',
        }),
      );
    });
    return { area: host.querySelector('textarea') as HTMLTextAreaElement, onValueChange };
  }

  it('Esc closes the strip and keeps the text', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ repo: 'acme-co/acme-web', people: [], hasNextPage: false }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const { area, onValueChange } = mount('');
    // Type "@riley" through the real change handler so the trigger opens.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(area, '@riley');
      area.setSelectionRange(6, 6);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host?.querySelector('[role="listbox"]')).not.toBeNull();
    expect(onValueChange).toHaveBeenLastCalledWith('@riley');

    act(() => {
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(host?.querySelector('[role="listbox"]')).toBeNull();
    expect(area.getAttribute('aria-expanded')).toBe('false');
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });
});
