// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepoMeta } from '../shared/issue-types';
import { bodyPreview, canCreate, createAction, emptyForm, hasDraft, withRepo } from '../web/phone/new-issue';
import { PhoneNewIssue } from '../web/phone/PhoneNewIssue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const META: RepoMeta = {
  repo: 'acme-web',
  labels: [{ id: 'L1', name: 'flaky-ci', color: 'ff0000' }],
  milestones: [],
  users: [{ id: 'U1', login: 'acme-dev' }],
  fetchedAt: 0,
};

vi.mock('../web/api', () => ({
  api: { repoMeta: async () => META, issueAction: vi.fn() },
}));

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(over: Partial<Parameters<typeof PhoneNewIssue>[0]> = {}) {
  const calls = { onChange: vi.fn(), onPick: vi.fn(), onDescription: vi.fn(), onCreate: vi.fn(), onClose: vi.fn() };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(PhoneNewIssue, {
        form: { ...emptyForm('acme-web'), title: 'Checkout button is cut off' },
        writesOff: false,
        busy: false,
        depth: 1,
        covered: false,
        ...calls,
        ...over,
      }),
    ),
  );
  return { el: host, ...calls };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const create = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.ph-btn.is-primary');

describe('new issue form logic', () => {
  it('needs a trimmed title and a connection to create', () => {
    expect(canCreate({ ...emptyForm('acme-web'), title: '  ' }, false)).toBe(false);
    expect(canCreate({ ...emptyForm('acme-web'), title: 'x' }, true)).toBe(false);
    expect(canCreate({ ...emptyForm('acme-web'), title: 'x' }, false)).toBe(true);
  });

  it('builds the create action from trimmed text', () => {
    const form = { ...emptyForm('acme-web'), title: ' T ', body: ' B ', labels: ['bug'], assignees: ['acme-dev'] };
    expect(createAction(form)).toEqual({
      type: 'create',
      repo: 'acme-web',
      title: 'T',
      body: 'B',
      labels: ['bug'],
      assignees: ['acme-dev'],
    });
  });

  it('clears labels and assignees when the repo changes', () => {
    const form = { ...emptyForm('acme-web'), labels: ['bug'], assignees: ['acme-dev'] };
    expect(withRepo(form, 'acme-api')).toMatchObject({ repo: 'acme-api', labels: [], assignees: [] });
    expect(withRepo(form, 'acme-web')).toBe(form);
  });

  it('detects a draft and previews four lines', () => {
    expect(hasDraft(emptyForm('acme-web'))).toBe(false);
    expect(hasDraft({ ...emptyForm('acme-web'), body: 'x' })).toBe(true);
    expect(bodyPreview('1\n2\n3\n4\n5')).toBe('1\n2\n3\n4');
  });
});

describe('new issue sheet', () => {
  it('creates with the button', () => {
    const { el, onCreate } = mount();
    act(() => create(el)?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps Create off while the title is empty', () => {
    const { el, onCreate } = mount({ form: emptyForm('acme-web') });
    expect(create(el)?.className).toContain('is-off');
    act(() => create(el)?.click());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows the busy state and blocks Cancel', () => {
    const { el, onClose } = mount({ busy: true });
    expect(create(el)?.textContent).toBe('Creating...');
    expect(create(el)?.getAttribute('aria-busy')).toBe('true');
    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.ph-btn')].find((b) => b.textContent === 'Cancel');
    expect(cancel?.disabled).toBe(true);
    act(() => cancel?.click());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the repository picker from its row', () => {
    const { el, onPick } = mount();
    act(() => el.querySelector<HTMLButtonElement>('button[aria-label^="Repository"]')?.click());
    expect(onPick).toHaveBeenCalledWith('repository');
  });

  it('asks before discarding a draft', () => {
    const { el, onClose } = mount();
    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.ph-btn')].find((b) => b.textContent === 'Cancel');
    act(() => cancel?.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Discard draft?');
  });

  it('keeps the rows tappable offline, since only Create is a write', () => {
    const { el, onPick } = mount({ writesOff: true });
    expect(el.querySelectorAll('button.ph-field')).toHaveLength(3);
    expect(el.textContent).not.toContain('Offline');
    act(() => el.querySelector<HTMLButtonElement>('button[aria-label^="Labels"]')?.click());
    expect(onPick).toHaveBeenCalledWith('labels');
    expect(create(el)?.className).toContain('is-off');
  });

  it('makes the rows inert without an Offline note while creating', () => {
    const { el } = mount({ busy: true });
    expect(el.querySelectorAll('button.ph-field')).toHaveLength(0);
    expect(el.querySelectorAll('div.ph-field')).toHaveLength(3);
    expect(el.textContent).not.toContain('Offline');
  });

  it('clears the stored description draft when the user discards', () => {
    window.localStorage.setItem('new-issue:acme-web', 'half written');
    const { el, onClose } = mount();
    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.ph-btn')].find((b) => b.textContent === 'Cancel');
    act(() => cancel?.click());
    act(() => el.querySelector<HTMLButtonElement>('.ph-btn.is-danger')?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('new-issue:acme-web')).toBeNull();
  });

  it('keeps the draft when the user keeps editing', () => {
    window.localStorage.setItem('new-issue:acme-web', 'half written');
    const { el, onClose } = mount();
    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.ph-btn')].find((b) => b.textContent === 'Cancel');
    act(() => cancel?.click());
    const keep = [...el.querySelectorAll<HTMLButtonElement>('.ph-btn')].find((b) => b.textContent === 'Keep editing');
    act(() => keep?.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('new-issue:acme-web')).toBe('half written');
  });

  it('closes at once when nothing was typed', () => {
    const { el, onClose } = mount({ form: emptyForm('acme-web') });
    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.ph-btn')].find((b) => b.textContent === 'Cancel');
    act(() => cancel?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
