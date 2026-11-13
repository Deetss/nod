/** How the service comes back after a settings save. */
export type RestartMode =
  /** The Electron app relaunches itself. */
  | 'relaunch'
  /** The plain server exits with `RESTART_EXIT_CODE`; the user (or a supervisor) starts it again. */
  | 'exit'
  /** Nothing restarts, so the saved file applies on the next start. */
  | 'none';

/** Exit status of the plain server after a settings save (sysexits EX_TEMPFAIL). A supervisor can restart on it. */
export const RESTART_EXIT_CODE = 75;

/** The body of a successful `PUT /api/settings`. */
export interface SettingsSaveResult {
  ok: true;
  restarting: boolean;
  mode: RestartMode;
}

/** The body of `GET /api/settings/saved`. False until `app-settings.json` exists, which is what first run keys on. */
export interface SettingsSavedState {
  saved: boolean;
}
