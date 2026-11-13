// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateStorageKeys } from '../web/storage-migrate';

beforeEach(() => window.localStorage.clear());

describe('migrateStorageKeys', () => {
  it('copies pre-rename keys and keeps the old ones', () => {
    window.localStorage.setItem('review-inbox-theme', 'light');
    window.localStorage.setItem('density', 'compact');
    migrateStorageKeys();
    expect(window.localStorage.getItem('nod-theme')).toBe('light');
    expect(window.localStorage.getItem('review-inbox-theme')).toBe('light');
    expect(window.localStorage.getItem('nod-density')).toBeNull();
  });

  it('never overwrites a key already set', () => {
    window.localStorage.setItem('review-inbox-theme', 'light');
    window.localStorage.setItem('nod-theme', 'dark');
    migrateStorageKeys();
    expect(window.localStorage.getItem('nod-theme')).toBe('dark');
  });
});
