import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PendingChecks } from '../server/orca-confirm';
import { checkAgain, parseReceipt, sendToSession } from '../server/orca-send';
import { OrcaSessions } from '../server/orca-sessions';
import { harness, readJson, type FakeSession } from './orca-helpers';

/** A real `terminal send --json` receipt from a provider Orca cannot observe, with ids replaced. */
const UNSUPPORTED = readFileSync(`${process.cwd()}/tests/fixtures/orca-send-receipt-unsupported.json`, 'utf8');
const REQ = '00000000-0000-4000-8000-000000000003';
const TEXT = '[nod] CI failed on acme-api #328. Please look at the Analyze (ruby) job.';

const s: FakeSession = { name: 'crew-1355', repo: 'acme-web', branch: 'x', state: 'done' };
const ID = 'r-acme-web::/w/crew-1355|tab-crew-1355:leaf-crew-1355';
const FAST = { confirmMs: 40, pollMs: 5 };

function setup() {
  const h = harness([s]);
  h.onSend.fn = () => UNSUPPORTED;
  return { h, sessions: new OrcaSessions(h.orca, () => h.clock.now) };
}

/** Answers a read without `--cursor` with the cursor, and a read after it with `after`. */
function terminal(cursor: string, after: string[]) {
  return (args: string[]) => (args.includes('--cursor') ? readJson(after, '99') : readJson([], cursor));
}

const reads = (h: ReturnType<typeof harness>) => h.calls.filter((c) => c[1] === 'terminal' && c[2] === 'read');

describe('parseReceipt on a real receipt', () => {
  it('keeps the request id and the delivery fields, and stays unconfirmed', () => {
    expect(parseReceipt(UNSUPPORTED)).toEqual({
      status: 'unconfirmed',
      requestId: REQ,
      receipt: { provider: 'unsupported', stages: ['input_accepted'], observation: 'unsupported' },
    });
  });
});

describe('confirming an unconfirmed send', () => {
  it('confirms from the terminal echo, even when the TUI wraps the line', async () => {
    const { h, sessions } = setup();
    h.onRead.fn = terminal('42', ['❯ [nod] CI failed on acme-api #328. Please', '  look at the Analyze (ruby) job.']);
    const res = await sendToSession(h.orca, sessions, ID, TEXT, FAST);
    expect(res).toMatchObject({ status: 'sent', confirmedBy: 'echo', requestId: REQ, receipt: { provider: 'unsupported' } });
    expect(reads(h)[1]).toContain('42');
    expect(h.sends()).toHaveLength(1);
  });

  it('confirms when an idle session starts working', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => {
      h.setSessions([{ ...s, state: 'working' }]);
      return UNSUPPORTED;
    };
    expect(await sendToSession(h.orca, sessions, ID, TEXT, FAST)).toMatchObject({ status: 'sent', confirmedBy: 'state' });
  });

  it('stays unconfirmed when nothing shows, and never resends', async () => {
    const { h, sessions } = setup();
    h.onRead.fn = terminal('42', ['some other output']);
    const res = await sendToSession(h.orca, sessions, ID, TEXT, FAST);
    expect(res.status).toBe('unconfirmed');
    expect(h.sends()).toHaveLength(1);
  });

  it('stays unconfirmed when the terminal cannot be read', async () => {
    const { h, sessions } = setup();
    h.onRead.fn = () => {
      throw new Error('terminal_not_found');
    };
    expect((await sendToSession(h.orca, sessions, ID, TEXT, FAST)).status).toBe('unconfirmed');
  });

  it('does not read the terminal when confirmMs is 0', async () => {
    const { h, sessions } = setup();
    await sendToSession(h.orca, sessions, ID, TEXT);
    expect(reads(h)).toHaveLength(0);
  });

  it('does not watch a send Orca already confirmed', async () => {
    const { h, sessions } = setup();
    h.onSend.fn = () => JSON.stringify({ result: { send: { prompt: { requestId: 'r', stages: ['input_accepted', 'turn_started'] } } } });
    expect(await sendToSession(h.orca, sessions, ID, TEXT, FAST)).toMatchObject({ status: 'sent', confirmedBy: 'orca' });
    expect(reads(h)).toHaveLength(1);
  });
});

describe('checkAgain', () => {
  it('finds a message that showed up late, from the cursor taken before the send', async () => {
    const { h, sessions } = setup();
    const pending = new PendingChecks();
    h.onRead.fn = terminal('42', []);
    expect((await sendToSession(h.orca, sessions, ID, TEXT, { ...FAST, pending })).status).toBe('unconfirmed');

    h.onRead.fn = terminal('99', [`❯ ${TEXT}`]);
    expect(await checkAgain(h.orca, sessions, pending, ID, REQ, 10)).toEqual({ status: 'sent', requestId: REQ, confirmedBy: 'echo' });
    expect(reads(h).at(-1)).toContain('42');
    expect(h.sends()).toHaveLength(1);
  });

  it('refuses an unknown request or another session', async () => {
    const { h, sessions } = setup();
    const pending = new PendingChecks();
    h.onRead.fn = terminal('42', []);
    await sendToSession(h.orca, sessions, ID, TEXT, { ...FAST, pending });
    expect(await checkAgain(h.orca, sessions, pending, ID, 'other', 10)).toBeUndefined();
    expect(await checkAgain(h.orca, sessions, pending, 'other-session', REQ, 10)).toBeUndefined();
  });

  it('forgets a send after ten minutes', () => {
    const clock = { now: 0 };
    const pending = new PendingChecks(() => clock.now);
    pending.put('r', { sessionId: ID, handle: 'h', snippet: 'x', wasIdle: true });
    clock.now = 10 * 60_000 + 1;
    expect(pending.get('r', ID)).toBeUndefined();
  });
});
