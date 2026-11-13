import DOMPurify from 'dompurify';

import { imageProxyUrl, parseImageUrl } from '../shared/image-url';

type PurifyWindow = Parameters<typeof DOMPurify>[0];

/**
 * Private-repo images cannot load in the browser, so allowed GitHub image URLs go through
 * the server. `data-canonical-src` is the original of a proxied image and is preferred over
 * the rendered `src`. `srcset` and `data-canonical-src` are dropped so nothing skips the rewrite.
 */
function routeThroughProxy(img: Element): void {
  const canonical = img.getAttribute('data-canonical-src');
  const src = [canonical, img.getAttribute('src')].find((s) => s && parseImageUrl(s));
  img.removeAttribute('srcset');
  img.removeAttribute('data-canonical-src');
  if (src) img.setAttribute('src', imageProxyUrl(src));
}

/**
 * Builds a sanitizer bound to one window. GitHub renders issue markdown to HTML; this
 * strips scripts, event handlers and unsafe URLs before anything reaches the page.
 * Links open in a new tab without a referrer.
 */
export function createSanitizer(win: PurifyWindow): (html: string) => string {
  const purify = DOMPurify(win);
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') routeThroughProxy(node);
  });
  return (html) =>
    purify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['style'],
    });
}

let browser: ((html: string) => string) | undefined;

/** The only way issue HTML is inserted into the page. */
export function sanitizeHtml(html: string): string {
  browser ??= createSanitizer(window);
  return browser(html);
}
