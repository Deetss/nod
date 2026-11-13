import { execFile } from 'node:child_process';

/** Reads the GitHub token once via `gh auth token`. It is never logged or written anywhere. */
export function readGhToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', ['auth', 'token'], { timeout: 15_000 }, (err, stdout) => {
      const token = stdout.trim();
      if (err || !token) {
        reject(new Error('Could not read a GitHub token. Run `gh auth login` and try again.'));
        return;
      }
      resolve(token);
    });
  });
}
