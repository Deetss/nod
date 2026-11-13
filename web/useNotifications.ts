import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSettings } from '../shared/notify-payload';
import {
  computeNotifications,
  DEFAULT_SETTINGS,
  type NotifySettings,
  type NotifyTarget,
} from '../shared/notify-rules';
import type { IssueInboxData } from '../shared/issue-types';
import type { InboxData } from '../shared/types';

const STORAGE_KEY = 'nod-notify';

/** Electron keeps settings in the userData folder; a browser would use localStorage. */
function loadFromStorage(): NotifySettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return (raw && parseSettings(JSON.parse(raw))) || DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useNotifySettings(): [NotifySettings, (next: NotifySettings) => void] {
  const [settings, setSettings] = useState<NotifySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const bridge = window.nod;
    if (!bridge) {
      setSettings(loadFromStorage());
      return;
    }
    void bridge.getSettings().then(setSettings, () => undefined);
  }, []);

  const update = useCallback((next: NotifySettings) => {
    setSettings(next);
    const bridge = window.nod;
    if (bridge) void bridge.setSettings(next).catch(() => undefined);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return [settings, update];
}

interface Options {
  data: InboxData | undefined;
  issues: IssueInboxData | undefined;
  /** False until the startup sweep ends; nothing is compared before then. */
  ready: boolean;
  settings: NotifySettings;
  seenIds: ReadonlySet<string>;
  onOpen: (target: NotifyTarget) => void;
}

/**
 * Compares each new inbox snapshot with the last and hands the result to the desktop
 * shell. The snapshot at the end of the startup sweep is the baseline, so starting the
 * app never notifies. Does nothing outside the desktop shell.
 */
export function useNotifications({ data, issues, ready, settings, seenIds, onOpen }: Options): void {
  const baseline = useRef<InboxData | undefined>(undefined);
  const issueBaseline = useRef<IssueInboxData | undefined>(undefined);
  const live = useRef({ settings, seenIds });
  live.current = { settings, seenIds };

  useEffect(() => {
    const bridge = window.nod;
    if (!bridge || !ready || !data) return;
    if (data === baseline.current && issues === issueBaseline.current) return;
    const prev = baseline.current;
    const prevIssues = issueBaseline.current;
    baseline.current = data;
    issueBaseline.current = issues;
    const items = computeNotifications({
      prev,
      next: data,
      prevIssues,
      nextIssues: issues,
      settings: live.current.settings,
      seenIds: live.current.seenIds,
      windowFocused: document.hasFocus(),
    });
    if (items.length > 0) void bridge.notify(items).catch(() => undefined);
  }, [data, issues, ready]);

  useEffect(() => window.nod?.onOpen(onOpen), [onOpen]);
}
