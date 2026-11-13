import { describe, expect, it } from 'vitest';
import { parseReceipt, sendToSession } from '../server/orca-send';
import { OrcaSessions } from '../server/orca-sessions';
import { failure, harness, type FakeSession } from './orca-helpers';

const s: FakeSession = { name: 'crew-1355', repo: 'acme-web', branch: 'x' };
const ID = 'r-acme-web::/w/crew-1355|tab-crew-1355:leaf-crew-1355';

function setup(sessions: FakeSession[] = [s]) {
  const h = harness(sessions);
  return { h, sessions: new OrcaSessions(h.orca, () => h.clock.now) };
}

describe('sendToSession arguments', () => {
  it('passes the handle, one --text value and --enter, with --json', async () => {
    const { h, sessions } = setup();
    const res = await sendToSession(h.orca, sessions, ID, '[nod] a b; rm -rf /');
    expect(res.status).toBe('sent');
    const [call] = h.sends();
    expect(call).toEqual([
      'orca-ide', 'terminal', 'send', '--terminal', 'term_crew-1355', '--text', '[nod] a b; rm -rf /', '--enter', '--json',
    ]);
  });

  it('never sends text without --enter', async () => {
    const { h, sessions } = setup();
    await sendToSession(h.orca, sessions, ID, '[nod] hi');
    expect(h.sends().every((c) => c.includes('--enter'))).toBe(true);
  });

  it('refuses untagged text', async () => {
    const { h, sessions } = setup();
    expect((await sendToSession(h.orca, sessions, ID, '--help')).status).toBe('unreachable');
    expect(h.sends()).toHaveLength(0);
  });

  it('resolves the handle at send time, not from an earlier read', async () => {
    const { h, sessions } = setup();
    await sessions.snapshot();
    h.setSessions([{ ...s, handle: 'term_replacement' }]);
    await sendToSession(h.orca, sessions, ID, '[nod] hi');
    expect(h.sends()[0]).toContain('term_replacement');
  });
});

describe('status mapping', () => {
  it('sent when Orca proves the turn started', async () => {
    const { h, sessions } = setup();
    expect(await sendToSession(h.orca, sessions, ID, '[nod] hi')).toEqual({
      status: 'sent',
      requestId: 'req-1',
      confirmedBy: 'orca',
      receipt: { stages: ['input_accepted', 'turn_started'] },
    });
  });

  it('unconfirmed when only input_accepted comes back', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => JSON.stringify({ result: { requestId: 'r2', stages: ['input_accepted'] } });
    expect(await sendToSession(h.orca, sessions, ID, '[nod] hi')).toEqual({
      status: 'unconfirmed',
      requestId: 'r2',
      receipt: { stages: ['input_accepted'] },
    });
  });

  it('unconfirmed for provider unsupported and old-host', async () => {
    const { h, sessions } = setup();
    for (const provider of ['unsupported', 'old-host']) {
      h.onSend.fn = () => JSON.stringify({ result: { provider, stages: ['input_accepted', 'turn_started'] } });
      expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('unconfirmed');
    }
  });

  it('unconfirmed for an unreadable receipt', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => 'ok';
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('unconfirmed');
  });

  it('not-writable for terminal_not_writable', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => {
      throw failure('terminal_not_writable');
    };
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('not-writable');
    expect(h.sends()).toHaveLength(1);
  });

  it('not-writable without sending when terminal list says the terminal is not writable', async () => {
    const { h, sessions } = setup([{ ...s, writable: false }]);
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('not-writable');
    expect(h.sends()).toHaveLength(0);
  });

  it('not-writable when the session is gone', async () => {
    const { h, sessions } = setup([]);
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('not-writable');
  });

  it('blocked for agent_prompt_blocked, with no retry', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => {
      throw failure('agent_prompt_blocked');
    };
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('blocked');
    expect(h.sends()).toHaveLength(1);
  });

  it('unreachable when Orca is down', async () => {
    const { h, sessions } = setup();
    h.down.value = true;
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('unreachable');
    expect(h.sends()).toHaveLength(0);
  });

  it('unreachable for an unknown CLI failure, and carries a retry id when Orca gave one', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => {
      throw new Error('{"requestId":"retry-9","error":"transport reset"}');
    };
    expect(await sendToSession(h.orca, sessions, ID, '[nod] hi')).toEqual({ status: 'unreachable', requestId: 'retry-9' });
    expect(h.sends()).toHaveLength(1);
  });

  it('unconfirmed on a timeout, never resent', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => {
      throw Object.assign(new Error(''), { timedOut: true });
    };
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('unconfirmed');
    expect(h.sends()).toHaveLength(1);
  });
});

describe('retry and stale handles', () => {
  it('reissues with the same request id when asked, once', async () => {
    const { h, sessions } = setup();
    await sendToSession(h.orca, sessions, ID, '[nod] hi', { retryRequestId: 'retry-9' });
    const args = h.sends()[0] ?? [];
    expect(args.slice(args.indexOf('--retry-request'), args.indexOf('--retry-request') + 2)).toEqual(['--retry-request', 'retry-9']);
    expect(h.sends()).toHaveLength(1);
  });

  it('re-resolves a stale handle and sends to the replacement only', async () => {
    const { h, sessions } = setup();
    let first = true;
    h.onSend.fn = (args) => {
      if (first) {
        first = false;
        h.setSessions([{ ...s, handle: 'term_new' }]);
        throw failure('terminal_handle_stale');
      }
      expect(args).toContain('term_new');
      return JSON.stringify({ result: { stages: ['turn_started'] } });
    };
    const res = await sendToSession(h.orca, sessions, ID, '[nod] hi');
    expect(res.status).toBe('sent');
    expect(h.sends().map((c) => c[4])).toEqual(['term_crew-1355', 'term_new']);
  });

  it('gives up when a stale handle has no replacement, without a second send', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => {
      throw failure('terminal_handle_stale');
    };
    expect((await sendToSession(h.orca, sessions, ID, '[nod] hi')).status).toBe('unreachable');
    expect(h.sends()).toHaveLength(1);
  });
});

describe('parseReceipt', () => {
  it('reads the request id', () => {
    expect(parseReceipt('{"requestId":"abc-1","stages":["turn_started"]}')).toEqual({
      status: 'sent',
      requestId: 'abc-1',
      confirmedBy: 'orca',
      receipt: { stages: ['turn_started'] },
    });
  });
});
