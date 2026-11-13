import { setOrgSettings } from '../web/org-settings';
import { TEST_SETTINGS } from './bot-settings';

// Client code reads settings from a module; every test starts with the bot on.
setOrgSettings(TEST_SETTINGS);
