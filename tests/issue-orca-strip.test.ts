// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionView } from '../shared/orca-sessions';
import { IssueOrcaStrip, type IssueOrcaStripProps, type StripView } from '../web/orca/IssueOrcaStrip';
import { PENDING_MS, stripViewFor } from '../web/orca/useIssueOrca';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(props: Partial<IssueOrcaStripProps> & { view: StripView }): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const all: IssueOrcaStripProps = { number: 195, wide: true, now: NOW, onOpen: vi.fn(), onSend: vi.fn(), onChoose: vi.fn(), ...props };
  act(() => root?.render(createElement(IssueOrcaStrip, all)));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const NOW = 10_000_000;
const session = (over: Partial<SessionView> = {}): SessionView => ({
  id: 's1',
  name: 'acme-banner Issue 195 Outlook Signature Setup',
  state: 'working',
  branch: 'dev/issue-195-link-signature',
  via: 'issue',
  reason: 'linked issue #195',
  lastOutputAt: NOW - 180_000,
  ...over,
});

describe('stripViewFor', () => {
  it('shows the one session, the chosen one of several, or a count', () => {
    const a = session();
    const b = session({ id: 's2' });
    expect(stripViewFor([a], undefined, undefined, NOW)).toEqual({ kind: 'one', session: a });
    expect(stripViewFor([a, b], 's2', undefined, NOW)).toEqual({ kind: 'one', session: b });
    expect(stripViewFor([a, b], undefined, undefined, NOW)).toEqual({ kind: 'many', count: 2 });
  });

  it('shows a dispatch as pending until Orca reports it, for at most two minutes', () => {
    const pending = { name: 'issue-195-link', at: NOW - 20_000 };
    expect(stripViewFor([], undefined, pending, NOW)).toMatchObject({ kind: 'pending', name: 'issue-195-link' });
    expect(stripViewFor([session()], undefined, pending, NOW)).toMatchObject({ kind: 'one' });
    expect(stripViewFor([], undefined, { ...pending, at: NOW - PENDING_MS }, NOW)).toBeUndefined();
    expect(stripViewFor([], undefined, undefined, NOW)).toBeUndefined();
  });
});

describe('IssueOrcaStrip', () => {
  it('S2 waiting: name, word, needs you, and both buttons with g chord caps', () => {
    const el = render({ view: { kind: 'one', session: session({ state: 'waiting' }) } });
    expect(el.querySelector('.iorca')?.className).toContain('iorca-waiting');
    expect(el.textContent).toContain('waiting');
    expect(el.textContent).toContain('needs you · output 3m ago');
    expect(el.textContent).toContain('Send message...');
    expect([...el.querySelectorAll('.kbd')].map((k) => k.textContent)).toEqual(['g s', 'g o']);
    expect(el.querySelector('.iorca-name')?.getAttribute('title')).toBe(
      'acme-banner Issue 195 Outlook Signature Setup\ndev/issue-195-link-signature',
    );
  });

  it('S3 done says finished, S7 unknown prints the word', () => {
    expect(render({ view: { kind: 'one', session: session({ state: 'done' }) } }).textContent).toContain('· finished 3m ago');
    act(() => root?.unmount());
    expect(render({ view: { kind: 'one', session: session({ state: 'unknown' }) } }).textContent).toContain('unknown');
  });

  it('below three panes drops the detail and Send message, keeps Open in Orca', () => {
    const el = render({ wide: false, view: { kind: 'one', session: session() } });
    expect(el.querySelector('.iorca-detail')).toBeNull();
    expect(el.textContent).not.toContain('Send message');
    expect(el.textContent).toContain('Open in Orca');
  });

  it('S4 several offers Choose', () => {
    const onChoose = vi.fn();
    const el = render({ view: { kind: 'many', count: 2 }, onChoose });
    expect(el.textContent).toContain('2 sessions linked to #195');
    act(() => el.querySelector<HTMLButtonElement>('button')?.click());
    expect(onChoose).toHaveBeenCalled();
  });

  it('S5 pending has no buttons and says it is waiting for Orca', () => {
    const el = render({ wide: false, view: { kind: 'pending', name: 'issue-195-link', at: NOW - 20_000 } });
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toContain('· dispatched 20s ago · waiting for Orca');
  });
});
