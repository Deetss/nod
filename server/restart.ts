import { RESTART_EXIT_CODE, type RestartMode } from '../shared/settings-save';
import type { LogSink } from './request-log';

/** What the settings route calls after a successful write. `run` must not block the response. */
export interface Restarter {
  mode: Exclude<RestartMode, 'none'>;
  run(): void;
}

/** Lets the response reach the browser before the process goes away. */
const FLUSH_MS = 250;

/**
 * The plain server (`pnpm start`, `pnpm serve`) has no supervisor of its own, so it logs one line
 * and exits with `RESTART_EXIT_CODE`, a failure status. `scripts/nod.service` (`Restart=on-failure`)
 * brings it back; without a supervisor the user starts it again.
 */
export function exitRestarter(
  log: LogSink = console.log,
  exit: (code: number) => void = (code) => process.exit(code),
): Restarter {
  return {
    mode: 'exit',
    run: () => {
      log(`[settings] saved. Nod is stopping (exit code ${RESTART_EXIT_CODE}); start it again to apply.`);
      setTimeout(() => exit(RESTART_EXIT_CODE), FLUSH_MS).unref();
    },
  };
}

/** The Electron app: relaunch the same command line, then quit this instance. */
export function relaunchRestarter(relaunch: () => void, quit: () => void): Restarter {
  return {
    mode: 'relaunch',
    run: () => {
      relaunch();
      setTimeout(quit, FLUSH_MS).unref();
    },
  };
}
