// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissApk, dismissedApk, installedApk, rememberApk } from '../web/apk-version';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.cookie = 'nod_apk=; max-age=0; path=/';
  window.history.replaceState(null, '', '/');
});

describe('installed APK version', () => {
  it('is unknown in a plain browser tab', () => {
    expect(installedApk()).toBeUndefined();
  });

  it('is remembered from the start URL, and the param leaves the address', () => {
    window.history.replaceState(null, '', '/?apk=9&open=pr/nod/3');
    rememberApk();
    expect(installedApk()).toBe(9);
    expect(window.location.search).toBe('?open=pr%2Fnod%2F3');
  });

  it('falls back to the cookie when storage is unavailable', () => {
    window.history.replaceState(null, '', '/?apk=11');
    rememberApk();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(installedApk()).toBe(11);
  });

  it('remembers a dismissed banner by version', () => {
    expect(dismissedApk()).toBeUndefined();
    dismissApk(12);
    expect(dismissedApk()).toBe(12);
  });
});
