import { DEFAULT_SETTINGS, type BotSettings, type Settings } from '../shared/settings';

/** The bot most tests run with: the defaults, switched on. */
export const TEST_BOT: BotSettings = { ...DEFAULT_SETTINGS.bot, enabled: true };

export const TEST_SETTINGS: Settings = { ...DEFAULT_SETTINGS, bot: TEST_BOT };
