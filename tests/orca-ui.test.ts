// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrSessions, SessionView } from '../shared/orca-sessions';
import { NotifyMenu } from '../web/NotifyMenu';
import { chipInputFor } from '../web/orca/OrcaContext';
import { OrcaChip } from '../web/orca/orca-ui';
import { OrcaSection, type OrcaSectionProps } from '../web/orca/OrcaSection';
import { ToastStack, useToasts } from '../web/toasts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const view = (over: Partial<SessionView> = {}): SessionView => ({
  id: 's1',
  name: 'crew-1355',
  state: 'working',
  branch: 'build-bot/x',
  via: 'pr',
  reason: 'linked PR #1355',
  ...over,
});

describe('OrcaChip', () => {
  it('prints the state word, which never sits inside the truncating name', () => {
    const el = render(createElement(OrcaChip, { input: { kind: 'one', session: view({ name: 'x'.repeat(29) }) } }));
    const chip = el.querySelector('.orca-chip');
    expect(chip?.getAttribute('aria-label')).toBe(`Orca session ${'x'.repeat(29)}, working`);
    expect(chip?.querySelector('.orca-chip-name')?.textContent).toHaveLength(29);
    expect(chip?.querySelector('.orca-chip-word')?.textContent).toBe('working');
    expect(chip?.className).toContain('orca-chip-working');
  });

  it.each(['working', 'waiting', 'done', 'unknown'] as const)('draws the %s state with its own class and word', (state) => {
    const el = render(createElement(OrcaChip, { input: { kind: 'one', session: view({ state }) } }));
    expect(el.querySelector(`.orca-chip-${state}`)).toBeTruthy();
    expect(el.querySelector('.orca-chip-word')?.textContent).toBe(state);
  });

  it('shows a count for several sessions and no name', () => {
    const el = render(createElement(OrcaChip, { input: { kind: 'many', count: 2 } }));
    expect(el.textContent).toBe('2 sessions');
    expect(el.querySelector('.orca-chip-name')).toBeNull();
  });
});

describe('chip and card CSS rules', () => {
  it('keeps the name at 96px and hides it below 1399px', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(`${process.cwd()}/web/orca.css`, 'utf8');
    expect(css).toMatch(/\.orca-chip-name\s*{[^}]*max-width:\s*96px/);
    expect(css).toMatch(/@media \(max-width: 1399px\)\s*{\s*\.orca-chip-name\s*{\s*display:\s*none/);
  });
});

describe('chipInputFor', () => {
  const ps = (related: SessionView[], possible: SessionView[] = []): PrSessions => ({ related, possible });
  it('shows one related session, a count for several, and nothing for possible matches', () => {
    expect(chipInputFor(ps([view()]))).toMatchObject({ kind: 'one' });
    expect(chipInputFor(ps([view(), view({ id: 's2' })]))).toEqual({ kind: 'many', count: 2 });
    expect(chipInputFor(ps([], [view({ via: 'issue' })]))).toBeUndefined();
    expect(chipInputFor(undefined)).toBeUndefined();
  });
});

function sectionProps(over: Partial<OrcaSectionProps> = {}): OrcaSectionProps {
  const noop = vi.fn();
  return {
    prId: 'PR_1',
    repo: 'acme-api',
    sessions: { related: [view()], possible: [] },
    autoOn: true,
    outcome: undefined,
    sent: undefined,
    busy: false,
    onSend: noop,
    onOpen: noop,
    onChoose: noop,
    onCloseOutcome: noop,
    onSendAgain: noop,
    onCheckAgain: noop,
    onRetry: noop,
    onDispatch: noop,
    onCopy: noop,
    onTurnOn: noop,
    ...over,
  };
}

describe('OrcaSection', () => {
  it('shows the card with Send message and Open in Orca for one related session', () => {
    const el = render(createElement(OrcaSection, sectionProps()));
    expect(el.textContent).toContain('Related by linked PR #1355');
    expect(el.textContent).toContain('Send message...');
    expect(el.textContent).toContain('Automatic messages on for acme-api');
  });

  it('shows the off footer with Turn on', () => {
    const el = render(createElement(OrcaSection, sectionProps({ autoOn: false })));
    expect(el.textContent).toContain('Automatic messages off for acme-api.');
    expect(el.textContent).toContain('Turn on');
  });

  it('shows a quiet line with no card when nothing is related', () => {
    const el = render(createElement(OrcaSection, sectionProps({ sessions: undefined })));
    expect(el.textContent).toBe('No Orca session related. Nobody notified.');
    expect(el.querySelector('.card')).toBeNull();
  });

  it('offers Choose for two sessions and for possible matches only', () => {
    const two = render(createElement(OrcaSection, sectionProps({ sessions: { related: [view(), view({ id: 'b' })], possible: [] } })));
    expect(two.textContent).toBe('2 sessions match. Choose');
    act(() => root?.unmount());
    host?.remove();
    const maybe = render(createElement(OrcaSection, sectionProps({ sessions: { related: [], possible: [view({ via: 'issue' })] } })));
    expect(maybe.textContent).toContain('1 possible match.');
  });

  it('replaces the body with the result and offers Dispatch with Orca when not writable', () => {
    const outcome = { prId: 'PR_1', status: 'not-writable' as const, session: view(), text: '[nod] hi' };
    const el = render(createElement(OrcaSection, sectionProps({ outcome })));
    expect(el.textContent).toContain('crew-1355 has exited');
    expect(el.textContent).toContain('Dispatch with Orca');
    expect(el.textContent).toContain('Copy message');
  });

  it('never claims delivery for an unconfirmed send', () => {
    const outcome = { prId: 'PR_1', status: 'unconfirmed' as const, session: view(), text: '[nod] hi' };
    const el = render(createElement(OrcaSection, sectionProps({ outcome })));
    expect(el.textContent).toContain('Sent, not confirmed');
    expect(el.textContent).toContain('Send again');
    expect(el.textContent).toContain('no readable receipt');
    expect(el.textContent).not.toContain('Check again');
  });

  it('names the receipt and offers Check again when Orca gave a request id', () => {
    const outcome = {
      prId: 'PR_1',
      status: 'unconfirmed' as const,
      requestId: 'req-9',
      receipt: { provider: 'unsupported', stages: ['input_accepted'] },
      session: view(),
      text: '[nod] hi',
    };
    const el = render(createElement(OrcaSection, sectionProps({ outcome })));
    expect(el.textContent).toContain('provider unsupported, stopped at input_accepted');
    expect(el.textContent).toContain('Check again');
  });

  it('says how a send was confirmed', () => {
    const outcome = { prId: 'PR_1', status: 'sent' as const, confirmedBy: 'echo' as const, session: view(), text: '[nod] hi' };
    const el = render(createElement(OrcaSection, sectionProps({ outcome })));
    expect(el.textContent).toContain('Sent to crew-1355');
    expect(el.textContent).toContain('showed up in the session’s terminal');
  });
});

function Stack() {
  const t = useToasts();
  return createElement(
    'div',
    null,
    createElement('button', { id: 'add', onClick: () => t.push({ kind: 'ok', message: `t${t.items.length}${Math.random()}` }) }),
    createElement(ToastStack, { items: t.items }),
  );
}

describe('toast stack', () => {
  it('holds at most two, oldest below', () => {
    const el = render(createElement(Stack));
    const add = el.querySelector<HTMLButtonElement>('#add');
    for (let i = 0; i < 3; i += 1) act(() => add?.click());
    expect(el.querySelectorAll('.toast')).toHaveLength(2);
  });
});

describe('settings select', () => {
  it('lists Default, On and Off per repo and reports changes', () => {
    const onRepo = vi.fn();
    const el = render(
      createElement(NotifyMenu, {
        settings: { muted: false } as never,
        onChange: vi.fn(),
        density: 'comfortable',
        onDensity: vi.fn(),
        orca: { enabled: true, repos: { 'acme-api': 'off' }, repoNames: ['acme-api', 'acme-web'], onEnabled: vi.fn(), onRepo },
      }),
    );
    act(() => el.querySelector<HTMLButtonElement>('button[aria-label="Notification settings"]')?.click());
    const selects = el.querySelectorAll<HTMLSelectElement>('select.orca-select');
    expect(selects).toHaveLength(2);
    expect([...(selects[0]?.options ?? [])].map((o) => o.textContent)).toEqual(['Default', 'On', 'Off']);
    expect(selects[0]?.value).toBe('off');
    expect(selects[0]?.className).toContain('is-set');
    expect(selects[1]?.value).toBe('default');
    expect(el.textContent).toContain('Default follows the box above (on).');
  });
});
