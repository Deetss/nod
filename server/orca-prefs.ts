import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  applyPrefsPatch,
  DEFAULT_ORCA_PREFS,
  parseOrcaPrefs,
  withChosen,
  withDispatchChoice,
  type DispatchChoice,
  type OrcaPrefs,
  type PrefsPatch,
} from '../shared/orca-prefs';
import { stateDir } from './devices';

export function defaultOrcaPrefsPath(): string {
  return join(stateDir(), 'orca-prefs.json');
}

/**
 * The automatic-message switch, the per-repo overrides and the session chosen per PR. Kept in the
 * app's state directory next to seen.json, mode 0600. Reads are synchronous once opened.
 */
export class OrcaPrefsStore {
  private value: OrcaPrefs = DEFAULT_ORCA_PREFS;
  private writing: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string | undefined) {}

  static memory(): OrcaPrefsStore {
    return new OrcaPrefsStore(undefined);
  }

  static async open(path: string = defaultOrcaPrefsPath()): Promise<OrcaPrefsStore> {
    const store = new OrcaPrefsStore(path);
    try {
      store.value = parseOrcaPrefs(JSON.parse(await readFile(path, 'utf8')) as unknown);
    } catch {
      // Missing or unreadable file: the defaults.
    }
    return store;
  }

  get(): OrcaPrefs {
    return this.value;
  }

  patch(p: PrefsPatch): OrcaPrefs {
    return this.set(applyPrefsPatch(this.value, p));
  }

  choose(prId: string, choice: { worktreeId: string; sessionId: string } | null): OrcaPrefs {
    return this.set(withChosen(this.value, prId, choice));
  }

  rememberDispatch(agent: string, choice: DispatchChoice): OrcaPrefs {
    return this.set(withDispatchChoice(this.value, agent, choice));
  }

  private set(next: OrcaPrefs): OrcaPrefs {
    this.value = next;
    this.persist();
    return next;
  }

  private persist(): void {
    const path = this.path;
    if (!path) return;
    const body = JSON.stringify(this.value);
    // Writes run one at a time, each saving the latest value.
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        await writeFile(tmp, body, { mode: 0o600 });
        await rename(tmp, path);
      })
      .catch((e: unknown) => console.error('[orca] could not save preferences:', e));
  }

  /** Resolves when pending writes finish. For tests. */
  async flush(): Promise<void> {
    await this.writing;
  }
}
