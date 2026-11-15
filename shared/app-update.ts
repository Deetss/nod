/** What `POST /api/updates/check` answers. */
export type UpdateCheckResult =
  /** Not an installed AppImage, such as `pnpm app` or `pnpm serve`. */
  | { state: 'unsupported' }
  | { state: 'current'; version: string }
  /** A newer release is downloading. The service restarts onto it; a window installs it on quit. */
  | { state: 'found'; version: string; installs: 'restart' | 'quit' }
  | { state: 'failed'; error: string };

/** The line Settings > Updates shows for a check. */
export function updateCheckText(r: UpdateCheckResult): string {
  switch (r.state) {
    case 'unsupported':
      return 'Updates install only in the AppImage build.';
    case 'current':
      return `Nod ${r.version} is the latest release.`;
    case 'found':
      return r.installs === 'restart'
        ? `Nod ${r.version} is downloading. The service restarts on it when done.`
        : `Nod ${r.version} is downloading. It installs when you quit Nod.`;
    case 'failed':
      return `Update check failed: ${r.error}`;
  }
}
