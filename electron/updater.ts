import { autoUpdater } from 'electron-updater';

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const log = {
  info: (m: unknown) => console.log(`[update] ${String(m)}`),
  warn: (m: unknown) => console.warn(`[update] ${String(m)}`),
  error: (m: unknown) => console.error(`[update] ${String(m)}`),
};

/**
 * Installs new GitHub releases. Only the process that owns the server calls this, so an attached
 * window and the service never both replace the AppImage.
 *
 * The service installs as soon as a download finishes and exits; systemd starts it on the new
 * build and open pages reload on the new build id. A window that owns its server installs on quit.
 */
export function startUpdater(opts: { service: boolean }): void {
  // False outside an AppImage, such as `pnpm app`.
  if (!autoUpdater.isUpdaterActive()) return;
  autoUpdater.logger = log;
  autoUpdater.autoInstallOnAppQuit = true;
  if (opts.service) autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall(true, false));

  const check = () =>
    autoUpdater.checkForUpdates().catch((e: unknown) => log.warn(`check failed: ${e instanceof Error ? e.message : String(e)}`));
  void check();
  setInterval(check, CHECK_EVERY_MS).unref();
}
