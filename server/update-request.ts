import { request } from 'node:http';
import type { UpdateCheckResult } from '../shared/app-update';
import { PHONE_PORT, TOKEN_HEADER } from './security';

/** Asks the Nod server on loopback to check for an update now, as Settings > Updates does. */
export function requestUpdate(token: string, port: number = PHONE_PORT): Promise<UpdateCheckResult> {
  const origin = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const req = request(
      `${origin}/api/updates/check`,
      { method: 'POST', headers: { origin, [TOKEN_HEADER]: token, 'content-type': 'application/json' }, timeout: 60_000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode ?? 0}: ${body.slice(0, 200)}`));
          try {
            resolve(JSON.parse(body) as UpdateCheckResult);
          } catch {
            reject(new Error('Unreadable answer from the Nod server'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('No answer within 60s')));
    req.on('error', reject);
    req.end('{}');
  });
}

/** Turns a request failure into the line `nod update` prints. */
export function requestErrorText(e: unknown, port: number = PHONE_PORT): string {
  const code = (e as { code?: string }).code;
  if (code === 'ECONNREFUSED') return `No Nod server is listening on port ${port}. Start it with: systemctl --user start nod`;
  return `Could not reach the Nod server: ${e instanceof Error ? e.message : String(e)}`;
}
