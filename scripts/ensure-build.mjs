import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync(new URL('../dist/web/index.html', import.meta.url))) {
  console.log('nod: building the front end (first run)...');
  const r = spawnSync('pnpm', ['build'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
