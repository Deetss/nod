import type { BotSettings } from '../shared/settings';

export interface KeyDef {
  keys: string;
  label: string;
}

/** Help sheet (`?`), in column order: left column first, then right. */
export const HELP_KEYS: KeyDef[] = [
  { keys: 'j / k', label: 'next / prev PR' },
  { keys: 'Enter', label: 'open review' },
  { keys: '] / [', label: 'next / prev file' },
  { keys: 'v', label: 'mark file viewed' },
  { keys: 'd', label: 'interdiff toggle' },
  { keys: 'w', label: 'wrap lines' },
  { keys: 'h', label: 'hide viewed' },
  { keys: 'a', label: 'approve' },
  { keys: 'r', label: 'request changes' },
  { keys: 'c', label: 'comment' },
  { keys: 'n / p', label: 'next / prev diff line (in a diff)' },
  { keys: 'V', label: 'start range, then n / p extend' },
  { keys: 'i', label: 'comment on cursor line (in a diff)' },
  { keys: 'C', label: 'comment on file' },
  { keys: 'Enter', label: 'open or close thread (on a thread marker)' },
  { keys: 'x', label: 'resolve or reopen thread (on a thread)' },
  { keys: 'Ctrl+Enter', label: 'post reply (in a thread reply box)' },
  { keys: 'Ctrl+Enter', label: 'submit review (in Finish review body)' },
  { keys: 'Up / Down / Enter / Esc', label: 'move, choose or close the Finish review menu' },
  { keys: 'm', label: 'auto-merge (in Issues, m is milestone)' },
  { keys: 'M', label: 'admin merge' },
  { keys: 'y', label: 'ready for review' },
  { keys: 'F', label: 'fix failing checks' },
  { keys: 'O', label: 'open on GitHub' },
  { keys: 's', label: 'send message to Orca session (in Issues, s is status)' },
  { keys: 'o', label: 'open Orca session (in Issues, o is reopen)' },
  { keys: 't', label: 'details drawer (narrow)' },
  { keys: 'e', label: 'expand description' },
  { keys: 'R', label: 'refresh' },
  { keys: 'P', label: 'pair phone' },
  { keys: ',', label: 'settings' },
  { keys: 'W', label: 'closed window' },
  { keys: 'g o / g p / g i / g a', label: 'org / PRs / Issues / Activity' },
  { keys: 'f', label: 'filter' },
  { keys: '/', label: 'search' },
  { keys: '?', label: 'this help' },
  { keys: 'Esc', label: 'back / close' },
];

export const FOOTER_WIDE: KeyDef[] = [
  { keys: 'j/k', label: 'next/prev PR' },
  { keys: 'Enter', label: 'open' },
  { keys: ']  [', label: 'next/prev file' },
  { keys: 'v', label: 'mark viewed' },
  { keys: 'd', label: 'interdiff' },
  { keys: 'w', label: 'wrap' },
  { keys: 'h', label: 'hide viewed' },
  { keys: 'a', label: 'approve' },
  { keys: 'r', label: 'request changes' },
  { keys: 'c', label: 'comment' },
  { keys: 'm', label: 'auto-merge' },
  { keys: 'M', label: 'admin merge' },
  { keys: 'y', label: 'ready' },
  { keys: 'O', label: 'open on GitHub' },
  { keys: 'W', label: 'closed window' },
  { keys: '/', label: 'search' },
  { keys: '?', label: 'help' },
];

/** Comfortable footer: six keys, then `? all keys` (see Footer). */
export const FOOTER_COMFORTABLE: KeyDef[] = [
  { keys: 'j k', label: 'move' },
  { keys: 'Enter', label: 'open' },
  { keys: 'v', label: 'viewed' },
  { keys: 'a', label: 'approve' },
  { keys: 'r', label: 'request changes' },
  { keys: 'c', label: 'comment' },
];

export const FOOTER_ISSUES_COMFORTABLE: KeyDef[] = [
  { keys: 'j k', label: 'move' },
  { keys: 'Enter', label: 'open' },
  { keys: 'c', label: 'comment' },
  { keys: 'l', label: 'labels' },
  { keys: 'e', label: 'edit title' },
  { keys: 'x', label: 'close' },
];

export const FOOTER_NARROW:KeyDef[] = [
  { keys: 'j/k', label: 'PR' },
  { keys: ']  [', label: 'file' },
  { keys: 'v', label: 'viewed' },
  { keys: 'd', label: 'interdiff' },
  { keys: 'a r c', label: 'review' },
  { keys: 'm M', label: 'merge' },
  { keys: 'y', label: 'ready' },
  { keys: 'O', label: 'GitHub' },
  { keys: '?', label: 'help' },
];

/** Issue keys for the help sheet. `L`, `T` and `B` carry the bot's name; `L` is left out while the bot is off. */
export const issueHelpKeys = (b: BotSettings): KeyDef[] =>
  ISSUE_HELP_KEYS.flatMap((k) => {
    if (k.keys === 'L') return b.enabled ? [{ keys: 'L', label: `hand to ${b.name}` }, ...botCheckKey(b)] : [];
    if (k.keys === 'T') return [{ keys: 'T', label: `ask ${b.name} to retry` }];
    if (k.keys === 'B') return [{ keys: 'B', label: `split as ${b.name} proposes` }];
    return [k];
  });

/** `K` is listed only while the bot is on, like `L`. */
const botCheckKey = (b: BotSettings): KeyDef[] => (b.enabled ? [{ keys: 'K', label: `check with ${b.name}` }] : []);

const ISSUE_HELP_KEYS: KeyDef[] = [
  { keys: 'j / k', label: 'next / prev issue' },
  { keys: 'Enter', label: 'open issue' },
  { keys: 'Space', label: 'select for bulk' },
  { keys: 'c', label: 'comment' },
  { keys: 'l', label: 'labels' },
  { keys: 'a', label: 'assign' },
  { keys: 'A', label: 'assign me / unassign me' },
  { keys: 'm', label: 'milestone (in PRs, m is auto-merge)' },
  { keys: 's', label: 'status' },
  { keys: 'S', label: 'start / stop work' },
  { keys: 'e', label: 'edit title' },
  { keys: 'x / X', label: 'close / not planned' },
  { keys: 'o', label: 'reopen' },
  { keys: 'D', label: 'dispatch with Orca' },
  { keys: 'L', label: 'hand to Bot' },
  { keys: 'T', label: 'ask bot to retry' },
  { keys: 'B', label: 'split as the bot proposes' },
  { keys: 'g o', label: 'open the issue’s Orca session' },
  { keys: 'g s', label: 'send to the issue’s Orca session' },
  { keys: 'n', label: 'new issue' },
  { keys: 'N', label: 'new sub-issue' },
  { keys: 'E', label: 'add existing issue as a sub-issue' },
  { keys: 'u', label: 'go to the parent issue' },
  { keys: 'Alt+↑ / ↓', label: 'move sub-issue' },
  { keys: 'Del', label: 'remove sub-issue' },
  { keys: '[ / ]', label: 'prev / next comment' },
  { keys: 'i', label: 'metadata sheet (narrow)' },
  { keys: '.', label: 'more comment actions' },
  { keys: 'O', label: 'open on GitHub' },
  { keys: 'R', label: 'refresh' },
  { keys: 'P', label: 'pair phone' },
  { keys: ',', label: 'settings' },
  { keys: 'W', label: 'closed window' },
  { keys: 'g p', label: 'PRs' },
  { keys: 'f', label: 'filter' },
  { keys: '/', label: 'search' },
  { keys: '?', label: 'this help' },
  { keys: 'Esc', label: 'back / close' },
];

export const FOOTER_ISSUES_WIDE: KeyDef[] = [
  { keys: 'j/k', label: 'next/prev issue' },
  { keys: 'Enter', label: 'open' },
  { keys: 'Space', label: 'select' },
  { keys: 'c', label: 'comment' },
  { keys: 'l', label: 'labels' },
  { keys: 'a', label: 'assign' },
  { keys: 'A', label: 'assign me' },
  { keys: 'm', label: 'milestone' },
  { keys: 'e', label: 'edit title' },
  { keys: 'x', label: 'close' },
  { keys: 'o', label: 'reopen' },
  { keys: 'D', label: 'Orca' },
  { keys: 'n', label: 'new issue' },
  { keys: 'N', label: 'sub-issue' },
  { keys: 'W', label: 'closed window' },
  { keys: 'g p', label: 'PRs' },
  { keys: '/', label: 'search' },
  { keys: '?', label: 'help' },
];

/** Replaces the Issues footer while a sub-issue row has focus. */
export const FOOTER_SUB_ISSUE_ROW: KeyDef[] = [
  { keys: '↑↓', label: 'sub-issue' },
  { keys: 'Enter', label: 'open' },
  { keys: 'Alt+↑ Alt+↓', label: 'move' },
  { keys: 'Del', label: 'remove' },
  { keys: 'Shift+F10', label: 'menu' },
  { keys: 'E', label: 'add existing' },
  { keys: 'Esc', label: 'leave list' },
];

export const FOOTER_ISSUES_NARROW: KeyDef[] = [
  { keys: 'j/k', label: 'issue' },
  { keys: 'c', label: 'comment' },
  { keys: 'l', label: 'labels' },
  { keys: 'a', label: 'assign' },
  { keys: 'x', label: 'close' },
  { keys: 'i', label: 'metadata' },
  { keys: 'n', label: 'new' },
  { keys: 'g p', label: 'PRs' },
  { keys: '?', label: 'help' },
];

export const ACTIVITY_HELP_KEYS: KeyDef[] = [
  { keys: 'j / k', label: 'next / prev item' },
  { keys: 'Enter', label: 'open the PR or issue' },
  { keys: 'O', label: 'open on GitHub' },
  { keys: 'R', label: 'refresh' },
  { keys: 'g p', label: 'PRs' },
  { keys: 'g i', label: 'Issues' },
  { keys: 'g a', label: 'Activity' },
  { keys: ',', label: 'settings' },
  { keys: '?', label: 'this help' },
  { keys: 'Esc', label: 'clear selection' },
];

export const FOOTER_ACTIVITY: KeyDef[] = [
  { keys: 'j/k', label: 'next/prev item' },
  { keys: 'Enter', label: 'open' },
  { keys: 'O', label: 'open on GitHub' },
  { keys: 'R', label: 'refresh' },
  { keys: 'g p', label: 'PRs' },
  { keys: 'g i', label: 'Issues' },
  { keys: '?', label: 'help' },
];
