import { homedir } from 'node:os';
import { join } from 'node:path';

/** The folder name under each XDG base, and the Electron app name. */
export const APP_ID = 'nod';

/** The folder name before the rename. Read only by the migration. */
export const LEGACY_APP_ID = 'review-inbox';

const base = (xdg: string | undefined, ...fallback: string[]) => xdg || join(homedir(), ...fallback);

export const stateBase = () => base(process.env.XDG_STATE_HOME, '.local', 'state');
export const configBase = () => base(process.env.XDG_CONFIG_HOME, '.config');
export const cacheBase = () => base(process.env.XDG_CACHE_HOME, '.cache');

export const stateDir = () => join(stateBase(), APP_ID);
export const configDir = () => join(configBase(), APP_ID);
export const cacheDir = () => join(cacheBase(), APP_ID);
