import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const headers = { 'content-type': 'application/json', host: `127.0.0.1:${PORT}`, origin: ORIGIN, 'x-nod-token': TOKEN };

function setup() {
  const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN });
  return {
    act: (body: object, h: Record<string, string> = headers) =>
      app.request(`${ORIGIN}/api/issue-action`, { method: 'POST', headers: h, body: JSON.stringify(body) }),
    detail: async (repo: string, n: number) =>
      (await (await app.request(`${ORIGIN}/api/issue/${repo}/${n}`, { headers: { host: headers.host } })).json()) as {
        subIssues: { id: string; number: number; state: string }[];
        parent?: { number: number };
      },
  };
}

const parent = { repo: 'acme-dev/notes', number: 12 };

describe('sub-issue writes through the issue-action guard', () => {
  it('needs the session token like every other write', async () => {
    const { act } = setup();
    const { 'x-nod-token': _t, ...noToken } = headers;
    const res = await act({ type: 'sub-remove', ...parent, childId: 'I_acme-dev/notes_15' }, noToken);
    expect(res.status).toBe(403);
  });

  it('refuses a move with both anchors or neither', async () => {
    const { act } = setup();
    const both = await act({ type: 'sub-move', ...parent, childId: 'I_acme-dev/notes_15', afterId: 'a', beforeId: 'b' });
    const none = await act({ type: 'sub-move', ...parent, childId: 'I_acme-dev/notes_15' });
    expect([both.status, none.status]).toEqual([400, 400]);
  });

  it('moves, removes and adds in fixture mode, and remove leaves the child closed as it was', async () => {
    const { act, detail } = setup();
    expect((await act({ type: 'sub-move', ...parent, childId: 'I_acme-co/acme-api_421', beforeId: 'I_acme-dev/notes_14' })).status).toBe(200);
    expect((await detail('acme-dev/notes', 12)).subIssues.map((c) => c.number)).toEqual([421, 14, 17, 15, 10]);

    await act({ type: 'sub-remove', ...parent, childId: 'I_acme-dev/notes_15' });
    expect((await detail('acme-dev/notes', 12)).subIssues.map((c) => c.number)).toEqual([421, 14, 17, 10]);
    const removed = await detail('acme-dev/notes', 15);
    expect(removed.parent).toBeUndefined();

    const refused = (await (await act({ type: 'sub-add', ...parent, childRepo: 'acme-co/acme-web', childNumber: 288, replaceParent: false })).json()) as { ok: boolean };
    expect(refused.ok).toBe(false);
    await act({ type: 'sub-add', ...parent, childRepo: 'acme-co/acme-web', childNumber: 288, replaceParent: true });
    expect((await detail('acme-co/acme-web', 288)).parent?.number).toBe(12);
  });
});
