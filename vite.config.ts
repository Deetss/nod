import { execFileSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { BUILD_FILE, DEV_BUILD, formatBuildId } from './shared/build-update.ts';

function gitShortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** Writes the build id beside index.html, where the server that serves this build reads it. */
function buildIdFile(build: string): Plugin {
  return {
    name: 'nod-build-id',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: BUILD_FILE, source: `${JSON.stringify({ build })}\n` });
    },
  };
}

export default defineConfig(({ command }) => {
  const build = command === 'build' ? formatBuildId(gitShortSha(), new Date()) : DEV_BUILD;
  return {
    root: 'web',
    plugins: [react(), buildIdFile(build)],
    define: { __NOD_BUILD__: JSON.stringify(build) },
    build: { outDir: '../dist/web', emptyOutDir: true },
    server: { proxy: { '/api': 'http://127.0.0.1:4477' } },
    test: { root: '.', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
  };
});
