export interface CallLog {
  method: string;
  /** REST path or GraphQL operation name. Never a token or a response body. */
  target: string;
  cost: number;
  cache: 'hit' | 'miss';
}

export type LogSink = (line: string) => void;

export const consoleSink: LogSink = (line) => console.log(line);

export function formatCall(c: CallLog): string {
  return `[gh] ${c.method} ${c.target} cost=${c.cost} cache=${c.cache}`;
}

/** Operation name of a GraphQL document, for the log line. */
export function operationName(query: string): string {
  return /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'anonymous';
}
