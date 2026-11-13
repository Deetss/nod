import {
  CLAUDE_MODELS,
  parseCodexCatalog,
  parseOpencodeModels,
  type AgentModels,
  type ModelOption,
} from '../shared/agent-models';
import { execBinary, type OrcaExec } from './orca';

const TTL_MS = 60 * 60_000;
const CLI_TIMEOUT_MS = 20_000;

/** Synthetic catalogs for fixture mode. The ids are invented. */
const FIXTURE_CODEX: ModelOption[] = [
  { id: 'fixture-large', label: 'Fixture Large', efforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'fixture-small', label: 'Fixture Small', efforts: ['low', 'medium'] },
];
const FIXTURE_OPENCODE: ModelOption[] = [
  { id: 'fixture/model-a', label: 'fixture/model-a', efforts: [] },
  { id: 'other/model-b', label: 'other/model-b', efforts: [] },
];

/**
 * The models each harness offers. Claude's come from its documented aliases; codex's from
 * `codex debug models` and opencode's from `opencode models`, read at most once an hour.
 * A CLI that fails leaves its agent with none. gemini has no list command.
 */
export class AgentModelCatalog {
  private cache: { at: number; value: AgentModels } | undefined;
  private loading: Promise<AgentModels> | undefined;

  constructor(
    private readonly opts: { fixtures?: boolean; exec?: OrcaExec; now?: () => number } = {},
  ) {}

  async get(): Promise<AgentModels> {
    const now = (this.opts.now ?? Date.now)();
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.value;
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });
    const value = await this.loading;
    this.cache = { at: now, value };
    return value;
  }

  private async load(): Promise<AgentModels> {
    if (this.opts.fixtures) return { claude: CLAUDE_MODELS, codex: FIXTURE_CODEX, opencode: FIXTURE_OPENCODE };
    const exec = this.opts.exec ?? execBinary;
    const read = async (bin: string, args: string[], parse: (raw: string) => ModelOption[]): Promise<ModelOption[]> => {
      try {
        return parse(await exec(bin, args, CLI_TIMEOUT_MS));
      } catch {
        return [];
      }
    };
    const [codex, opencode] = await Promise.all([
      read('codex', ['debug', 'models'], parseCodexCatalog),
      read('opencode', ['models'], parseOpencodeModels),
    ]);
    return {
      claude: CLAUDE_MODELS,
      ...(codex.length > 0 ? { codex } : {}),
      ...(opencode.length > 0 ? { opencode } : {}),
    };
  }
}
