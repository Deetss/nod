// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrDetail } from '../shared/types';
import { useOrca, type OrcaController } from '../web/orca/useOrca';

vi.mock('../web/api', () => ({
  api: {
    orcaSessions: vi.fn(() => new Promise(() => undefined)),
    orcaModels: vi.fn(() => new Promise(() => undefined)),
    orcaDispatch: vi.fn(() => Promise.resolve({ ok: true, worktree: 'pr-7-finding' })),
  },
}));

vi.mock('../web/useRemote', () => ({
  useRemote: () => ({
    data: { available: true, at: 1, byPr: {}, byIssue: {}, prefs: { enabled: true, repos: {} } },
    reload: () => undefined,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const detail = { summary: { id: 'pr-1', repo: 'acme/app', number: 7 }, headRef: 'feat/x' } as unknown as PrDetail;

function mount(): { ctl: () => OrcaController; el: HTMLElement } {
  let ctl: OrcaController | undefined;
  function Harness() {
    ctl = useOrca({
      detail,
      orca: undefined,
      active: true,
      syncedAt: undefined,
      repoNames: [],
      toast: () => undefined,
      onDetails: () => undefined,
    });
    return createElement('div', null, ctl.overlays);
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Harness)));
  return { ctl: () => ctl as OrcaController, el: host };
}

describe('finding dispatch with no linked session', () => {
  it('opens the new-worktree dialog prefilled with the finding', () => {
    const { ctl, el } = mount();
    let started = false;
    act(() => {
      started = ctl().findingSender?.send('Fix the coverage summary', 'pr-1|t1') ?? false;
    });

    expect(started).toBe(true);
    expect(el.querySelector('textarea')?.value).toBe('Fix the coverage summary');
    expect((el.querySelector('input[value="pr-7-finding"]') as HTMLInputElement | null)?.value).toBe('pr-7-finding');
  });
});
