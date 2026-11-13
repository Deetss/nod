/** Limits and markdown for images pasted or dropped into a comment box. Browser and server share them. */

export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface UploadResult {
  url: string;
}

export const isUploadType = (t: string): t is UploadType => (UPLOAD_TYPES as readonly string[]).includes(t);

/** Why a file cannot be uploaded, or undefined when it can. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | undefined {
  if (!isUploadType(file.type)) return `${file.name || 'That file'} is not a PNG, JPEG, GIF or WebP image`;
  if (file.size === 0) return `${file.name || 'The image'} is empty`;
  if (file.size > UPLOAD_MAX_BYTES) return `${file.name || 'The image'} is over 10 MB`;
  return undefined;
}

/** The file name GitHub stores: a safe basename, falling back to `image.<ext>`. */
export function uploadName(name: string, type: UploadType): string {
  const base = name.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._ -]/g, '').trim().slice(0, 100);
  return base || `image.${type.split('/')[1]}`;
}

/** Alt text the way github.com writes it: the name without its extension. */
function altText(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(/[\\[\]\r\n]/g, ' ').trim() || 'image';
}

export const imageMarkdown = (name: string, url: string): string => `![${altText(name)}](${url})`;
