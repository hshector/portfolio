// next/navigation, next/link and next/cache for the demo: the app's routes live in the URL's hash
// (/warrenia-app/#/research/AAPL), so the demo is one static page that also works inside the
// pavilion's frame. The router (../router.tsx) listens to these.

import { createContext, useContext } from 'react';

export const RouteContext = createContext<{ path: string; search: URLSearchParams }>({ path: '/', search: new URLSearchParams() });

/** "/research/AAPL?x=1" → "#/research/AAPL?x=1". External and hash links stay as they are. */
export function toHash(href: string): string {
  return href.startsWith('/') ? `#${href}` : href;
}

export function currentRoute(): { path: string; search: URLSearchParams } {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  return { path: p.startsWith('/') ? p : '/', search: new URLSearchParams(q) };
}

export function navigate(href: string, replace = false) {
  const h = toHash(href);
  if (!h.startsWith('#')) return void location.assign(h);
  if (replace) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Re-runs the current page (what a server action's revalidatePath does in Next.js). */
export function refresh() {
  dispatchEvent(new Event('warrenia:refresh'));
}

export class Redirect extends Error {
  constructor(readonly href: string) {
    super(`redirect ${href}`);
  }
}
export class NotFound extends Error {}

export function redirect(href: string): never {
  throw new Redirect(href);
}
export function notFound(): never {
  throw new NotFound('not found');
}

export function usePathname() {
  return useContext(RouteContext).path;
}
export function useSearchParams() {
  return useContext(RouteContext).search;
}
export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, true),
    refresh,
    back: () => history.back(),
    forward: () => history.forward(),
    prefetch: (_href?: string) => {},
  };
}

// next/cache
export function revalidatePath(_path?: string, _type?: 'page' | 'layout') {
  queueMicrotask(refresh);
}
