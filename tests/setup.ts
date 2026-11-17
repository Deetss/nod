import { setOrgSettings } from '../web/org-settings';
import { TEST_SETTINGS } from './bot-settings';

// Client code reads settings from a module; every test starts with the bot on.
setOrgSettings(TEST_SETTINGS);

// jsdom has no ResizeObserver, and Primer's Dialog measures its footer with one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
