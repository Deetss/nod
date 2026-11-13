// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, usePhoneWrites, type PhoneWrites } from '../web/phone/usePhoneWrites';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const issueAction = vi.fn();
vi.mock('../web/api', () => ({ api: { issueAction: (a: unknown) => issueAction(a) } }));

let root: Root | undefined;
let host: HTMLElement | undefined;
let writes: PhoneWrites | undefined;

function Probe() {
  writes = usePhoneWrites(() => undefined);
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
  issueAction.mockReset();
  vi.useRealTimers();
});

const ACTION = { type: 'create' as const, repo: 'acme-web', title: 'T', body: '', labels: [], assignees: [] };

describe('phone feedback', () => {
  it('loads the spinner css in the phone bundle', () => {
    expect(readFileSync('web/main.tsx', 'utf8')).toContain("import './base.css'");
    expect(readFileSync('web/base.css', 'utf8')).toContain('.spinner {');
  });

  it('toasts the server message and returns the number on create', async () => {
    issueAction.mockResolvedValue({ ok: true, message: 'Created acme-web #43', number: 43 });
    mount();
    let made: { number?: number } | undefined;
    await act(async () => {
      made = await writes?.createIssue(ACTION);
    });
    expect(made).toEqual({ number: 43 });
    expect(issueAction).toHaveBeenCalledWith(ACTION);
    expect(writes?.toast).toEqual({ ok: true, message: 'Created acme-web #43' });
  });

  it('counts a create with no reported number as success', async () => {
    issueAction.mockResolvedValue({ ok: true, message: 'Created acme-web' });
    mount();
    let made: { number?: number } | undefined;
    await act(async () => {
      made = await writes?.createIssue(ACTION);
    });
    expect(made).toEqual({});
  });

  it('prefixes a failed create with Could not and the server message', async () => {
    issueAction.mockResolvedValue({ ok: false, message: 'Validation failed' });
    mount();
    let made: { number?: number } | undefined = { number: 1 };
    await act(async () => {
      made = await writes?.createIssue(ACTION);
    });
    expect(made).toBeUndefined();
    expect(writes?.toast).toEqual({ ok: false, message: 'Could not create issue: Validation failed' });
  });

  it('clears the toast after five seconds', async () => {
    issueAction.mockResolvedValue({ ok: true, message: 'Done' });
    mount();
    vi.useFakeTimers();
    await act(async () => {
      await writes?.issue({ type: 'reopen', repo: 'acme-web', number: 42 }, 'Issue reopened');
    });
    expect(writes?.toast?.message).toBe('Issue reopened');
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(writes?.toast).toBeUndefined();
  });
});
