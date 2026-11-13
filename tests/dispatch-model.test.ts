import { describe, expect, it } from 'vitest';
import { launchLine, parseCodexCatalog, parseOpencodeModels, phoneAgent, type OrcaModelsResponse } from '../shared/agent-models';
import { withDispatchChoice, DEFAULT_ORCA_PREFS, parseOrcaPrefs } from '../shared/orca-prefs';
import { AgentModelCatalog } from '../server/agent-models';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { dispatchArgs, dispatchBody, Orca } from '../server/orca';
import { OrcaPrefsStore } from '../server/orca-prefs';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const good = { repo: 'acme-co/acme-api', number: 12, agent: 'claude', name: 'issue-12-fix-it', prompt: 'Work on it' };

/** The shape of `codex debug models`, trimmed to what the parser reads. */
const CODEX = JSON.stringify({
  models: [
    { slug: 'gpt-6-astra', display_name: 'GPT-6-Astra', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'ultra' }, { effort: 'warp' }] },
    { slug: 'codex-auto-review', display_name: 'Codex Auto Review', visibility: 'hide', supported_reasoning_levels: [{ effort: 'low' }] },
    { slug: 'bad id with spaces', display_name: 'Bad', visibility: 'list', supported_reasoning_levels: [] },
  ],
});

describe('parseCodexCatalog', () => {
  it('keeps listed models with their known effort levels', () => {
    expect(parseCodexCatalog(CODEX)).toEqual([{ id: 'gpt-6-astra', label: 'GPT-6-Astra', efforts: ['low', 'high', 'ultra'] }]);
  });

  it('gives nothing for output it cannot read', () => {
    expect(parseCodexCatalog('not json')).toEqual([]);
    expect(parseCodexCatalog('{"models":3}')).toEqual([]);
  });
});

describe('parseOpencodeModels', () => {
  it('keeps provider/model lines once each and skips noise', () => {
    const raw = 'opencode/big-pickle\nhuggingface/deepseek-ai/DeepSeek-V3.1\nopencode/big-pickle\nWarning: cache stale\n\n';
    expect(parseOpencodeModels(raw).map((m) => m.id)).toEqual(['opencode/big-pickle', 'huggingface/deepseek-ai/DeepSeek-V3.1']);
    expect(parseOpencodeModels(raw)[0]?.efforts).toEqual([]);
  });
});

describe('launchLine and phoneAgent', () => {
  const r: OrcaModelsResponse = {
    models: { codex: [{ id: 'gpt-6-astra', label: 'GPT-6-Astra', efforts: ['high'] }] },
    remembered: { claude: { model: 'sonnet' }, codex: { model: 'gpt-6-astra', effort: 'high' } },
    lastAgent: 'codex',
  };

  it('names the agent, the model label and the effort', () => {
    expect(launchLine('codex', r)).toBe('codex · GPT-6-Astra · high effort');
    expect(launchLine('claude', r)).toBe('claude · sonnet · default effort');
    expect(launchLine('gemini', r)).toBe('gemini · harness default · default effort');
  });

  it('uses the agent last dispatched with while it is still offered', () => {
    expect(phoneAgent(['claude', 'codex'], r, 'claude')).toBe('codex');
    expect(phoneAgent(['claude'], r, 'claude')).toBe('claude');
    expect(phoneAgent(['claude'], undefined, 'claude')).toBe('claude');
  });
});

describe('AgentModelCatalog', () => {
  it('reads codex once an hour and drops codex when its CLI fails', async () => {
    let calls = 0;
    const clock = { now: 0 };
    const ok = new AgentModelCatalog({
      exec: async (bin) => {
        if (bin !== 'codex') throw new Error(`${bin}: not found`);
        calls += 1;
        return CODEX;
      },
      now: () => clock.now,
    });
    expect((await ok.get()).codex?.map((m) => m.id)).toEqual(['gpt-6-astra']);
    await ok.get();
    clock.now = 60 * 60_000;
    await ok.get();
    expect(calls).toBe(2);

    const broken = new AgentModelCatalog({ exec: async () => Promise.reject(new Error('codex: not found')) });
    const models = await broken.get();
    expect(models.codex).toBeUndefined();
    expect(models.claude?.map((m) => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
  });
});

describe('dispatchArgs model flags', () => {
  const flags = (extra: object) => {
    const a = dispatchArgs('r1', dispatchBody.parse({ ...good, ...extra }));
    const i = a.indexOf('--model');
    return i < 0 ? [] : a.slice(i, a.indexOf('--no-parent'));
  };

  it('passes --model and --effort, and nothing for the harness default', () => {
    expect(flags({ model: 'sonnet', effort: 'high' })).toEqual(['--model', 'sonnet', '--effort', 'high']);
    expect(flags({ model: 'sonnet' })).toEqual(['--model', 'sonnet']);
    expect(flags({ model: '' })).toEqual([]);
    expect(flags({})).toEqual([]);
  });

  it('rejects an effort without a model, an unknown effort and a bad model id', () => {
    expect(dispatchBody.safeParse({ ...good, model: '', effort: 'high' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...good, model: 'sonnet', effort: 'warp' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...good, model: '--help' }).success).toBe(false);
  });
});

describe('remembered choice', () => {
  it('stores the model per agent and drops an effort that has no model', () => {
    const p = withDispatchChoice(withDispatchChoice(DEFAULT_ORCA_PREFS, 'claude', { model: 'sonnet', effort: 'low' }), 'codex', { effort: 'high' });
    expect(p.dispatch).toEqual({ claude: { model: 'sonnet', effort: 'low' }, codex: {} });
    expect(p.lastAgent).toBe('codex');
    expect(parseOrcaPrefs(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('dispatch route', () => {
  function setup() {
    const logs: string[] = [];
    const prefs = OrcaPrefsStore.memory();
    const app = createApp({
      provider: new FixtureProvider(),
      port: PORT,
      token: TOKEN,
      orca: new Orca({ fixtures: true, log: (l) => logs.push(l) }),
      orcaPrefs: prefs,
    });
    const headers = { 'content-type': 'application/json', host: `127.0.0.1:${PORT}`, origin: ORIGIN, 'x-nod-token': TOKEN };
    const dispatch = (body: object) => app.request(`${ORIGIN}/api/orca/dispatch`, { method: 'POST', headers, body: JSON.stringify(body) });
    const models = async () =>
      (await (await app.request(`${ORIGIN}/api/orca/models`, { headers: { host: `127.0.0.1:${PORT}` } })).json()) as OrcaModelsResponse;
    return { logs, dispatch, models };
  }

  it('remembers the dialog choice and applies it to a dispatch that names no model', async () => {
    const s = setup();
    expect((await s.dispatch({ ...good, model: 'sonnet', effort: 'medium' })).status).toBe(200);
    expect(s.logs[0]).toContain('"--model","sonnet","--effort","medium"');
    expect((await s.models()).remembered).toEqual({ claude: { model: 'sonnet', effort: 'medium' } });
    expect((await s.models()).lastAgent).toBe('claude');

    expect((await s.dispatch(good)).status).toBe(200);
    expect(s.logs[1]).toContain('"--model","sonnet","--effort","medium"');
  });

  it('remembers an explicit harness default, which passes no flags', async () => {
    const s = setup();
    await s.dispatch({ ...good, model: 'opus' });
    await s.dispatch({ ...good, model: '' });
    await s.dispatch(good);
    expect(s.logs[2]).not.toContain('--model');
  });

  it('serves the fixture catalog', async () => {
    const m = (await setup().models()).models;
    expect(m.claude?.map((x) => x.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
    expect(m.codex?.length).toBeGreaterThan(0);
  });
});
