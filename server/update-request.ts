import { request } from 'node:http';
import type { UpdateCheckResult } from '../shared/app-update';
import { PHONE_PORT, TOKEN_HEADER } from './security';

/** Calls the Nod server on loopback with the session token, as the desktop window does. */
export function serviceRequest<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  token: string,
  body?: unknown,
  port: number = PHONE_PORT,
): Promise<T> {
  const origin = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const req = request(
      `${origin}${path}`,
      { method, headers: { origin, [TOKEN_HEADER]: token, 'content-type': 'application/json' }, timeout: 60_000 },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode ?? 0}: ${errorText(text)}`));
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error('Unreadable answer from the Nod server'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('No answer within 60s')));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** The server's `{ error }` text, or the start of the raw body. */
function errorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Not JSON.
  }
  return body.slice(0, 200);
}

/** Turns a request failure into the line `nod update` prints. */
export function requestErrorText(e: unknown, port: number = PHONE_PORT): string {
  const code = (e as { code?: string }).code;
  if (code === 'ECONNREFUSED') return `No Nod server is listening on port ${port}. Start it with: systemctl --user start nod`;
  return `Could not reach the Nod server: ${e instanceof Error ? e.message : String(e)}`;
}

/** Asks the Nod server on loopback to check for an update now, as Settings > Updates does. */
export function requestUpdate(token: string, port: number = PHONE_PORT): Promise<UpdateCheckResult> {
  return serviceRequest<UpdateCheckResult>('POST', '/api/updates/check', token, {}, port);
}
