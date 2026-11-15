import { autoUpdater } from 'electron-updater';
import type { UpdateCheckResult } from '../shared/app-update';

const CHECK_EVERY_MS = 60 * 60 * 1000;

const log = {
  info: (m: unknown) => console.log(`[update] ${String(m)}`),
  warn: (m: unknown) => console.warn(`[update] ${String(m)}`),
  error: (m: unknown) => console.error(`[update] ${String(m)}`),
};

export interface Updater {
  /** Checks now. A newer release starts downloading, as on the hourly check. */
  check(): Promise<UpdateCheckResult>;
}

/**
 * Installs new GitHub releases. Only the process that owns the server calls this, so an attached
 * window and the service never both replace the AppImage.
 *
 * The service installs as soon as a download finishes and exits; systemd starts it on the new
 * build and open pages reload on the new build id. A window that owns its server installs on quit.
 * Undefined outside an AppImage, such as `pnpm app`.
 */
export function startUpdater(opts: { service: boolean }): Updater | undefined {
  if (!autoUpdater.isUpdaterActive()) return undefined;
  autoUpdater.logger = log;
  autoUpdater.autoInstallOnAppQuit = true;
  if (opts.service) autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall(true, false));

  const check = async (): Promise<UpdateCheckResult> => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return { state: 'unsupported' };
      const version = result.updateInfo.version;
      if (!result.isUpdateAvailable) return { state: 'current', version };
      return { state: 'found', version, installs: opts.service ? 'restart' : 'quit' };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      log.warn(`check failed: ${error}`);
      return { state: 'failed', error };
    }
  };
  void check();
  setInterval(() => void check(), CHECK_EVERY_MS).unref();
  return { check };
}
