import type { NotifyItem, NotifySettings, NotifyTarget } from './notify-rules';
import type { NotifyTargetResult } from './notify-test';

/** The only API the Electron preload exposes to the page, as `window.nod`. */
export interface NodBridge {
  notify: (items: NotifyItem[]) => Promise<void>;
  /** Shows the test notification now, even while focused or muted, and says whether it showed. */
  testNotify: () => Promise<NotifyTargetResult>;
  /** Called when the user clicks a notification that carries a target. Returns an unsubscribe. */
  onOpen: (cb: (target: NotifyTarget) => void) => () => void;
  getSettings: () => Promise<NotifySettings>;
  setSettings: (settings: NotifySettings) => Promise<NotifySettings>;
}

declare global {
  interface Window {
    nod?: NodBridge;
  }
}
