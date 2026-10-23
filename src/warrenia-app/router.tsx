// The demo's router: WarrenIA's own pages (vendor/warrenia/web/app/(app)), which in Next.js are
// server components, are run here in the browser. A page is an async function that reads its
// data and returns elements; resolve() awaits it, and any async component inside it, before
// React renders the result. A server action's revalidatePath() re-runs the current page.

import { cloneElement, createElement, isValidElement, useEffect, useState, type ReactNode } from 'react';

import Layout from '@vendor/app/(app)/layout';
import ErrorView from '@vendor/app/(app)/error';
import Loading from '@vendor/app/(app)/loading';

import { currentRoute, navigate, NotFound, Redirect, RouteContext } from './shims/navigation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = { default: (props: any) => unknown; metadata?: { title?: string }; generateMetadata?: (p: any) => Promise<{ title?: string }> };
const ROUTES: [RegExp, () => Promise<Mod>, string[]][] = [
  [/^\/$/, () => import('@vendor/app/(app)/page'), []],
  [/^\/plan$/, () => import('@vendor/app/(app)/plan/page'), []],
  [/^\/radar$/, () => import('@vendor/app/(app)/radar/page'), []],
  [/^\/research$/, () => import('@vendor/app/(app)/research/page'), []],
  [/^\/research\/compare$/, () => import('@vendor/app/(app)/research/compare/page'), []],
  [/^\/research\/([^/]+)$/, () => import('@vendor/app/(app)/research/[ticker]/page'), ['ticker']],
  [/^\/portfolio$/, () => import('@vendor/app/(app)/portfolio/page'), []],
  [/^\/portfolio\/transactions$/, () => import('@vendor/app/(app)/portfolio/transactions/page'), []],
  [/^\/portfolio\/import$/, () => import('@vendor/app/(app)/portfolio/import/page'), []],
  [/^\/watchlist$/, () => import('@vendor/app/(app)/watchlist/page'), []],
  [/^\/alerts$/, () => import('@vendor/app/(app)/alerts/page'), []],
  [/^\/settings$/, () => import('@vendor/app/(app)/settings/page'), []],
];

const isAsync = (f: unknown) => typeof f === 'function' && f.constructor.name === 'AsyncFunction';

/** Awaits every async (server) component in the tree; client components are left to React. */
export async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  if (isAsync(node.type)) return resolve(await (node.type as (p: unknown) => Promise<ReactNode>)(props));
  if (props && props.children !== undefined) return cloneElement(node, undefined, ...([] as ReactNode[]).concat(await resolve(props.children as ReactNode)));
  return node;
}

function NotFoundView() {
  return createElement('div', { className: 'mx-auto max-w-[560px] py-16 text-center' }, createElement('h1', { className: 'text-[22px] font-bold' }, 'Not found'), createElement('p', { className: 'mt-2 text-ink-2' }, createElement('a', { href: '#/radar', className: 'text-accent' }, 'Back to the radar')));
}

async function render(path: string, search: URLSearchParams): Promise<ReactNode> {
  const hit = ROUTES.find(([re]) => re.test(path));
  if (!hit) throw new NotFound('no route');
  const [re, load, names] = hit;
  const m = path.match(re)!;
  const params = Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
  const props = { params: Promise.resolve(params), searchParams: Promise.resolve(Object.fromEntries(search)) };
  const mod = await load();
  const meta = mod.generateMetadata ? await mod.generateMetadata(props) : mod.metadata;
  document.title = meta?.title ? `${meta.title} · WarrenIA` : 'WarrenIA';
  // (a page is a server component: called directly, so a redirect() in a page without data also works)
  const page = await (mod.default as (p: unknown) => ReactNode | Promise<ReactNode>)(props);
  return resolve(createElement(Layout, null, page));
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<ReactNode>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const onHash = () => setRoute((r) => {
      const next = currentRoute();
      return next.path === r.path && String(next.search) === String(r.search) ? r : next;
    });
    const onRefresh = () => setTick((n) => n + 1);
    addEventListener('hashchange', onHash);
    addEventListener('warrenia:refresh', onRefresh);
    onHash(); // (the address may have changed before this listener was there)
    return () => {
      removeEventListener('hashchange', onHash);
      removeEventListener('warrenia:refresh', onRefresh);
    };
  }, []);

  // a new page shows the app's loading screen; a refresh keeps the current one until the new data is in
  const key = `${route.path}?${route.search}`;
  const [shown, setShown] = useState(key);
  useEffect(() => {
    let live = true;
    if (shown !== key) setView(null);
    render(route.path, route.search)
      .then((v) => {
        if (!live) return;
        setError(null);
        setView(v);
        setShown(key);
        dispatchEvent(new CustomEvent('warrenia:route', { detail: key }));
      })
      .catch(async (e: unknown) => {
        if (!live) return;
        if (e instanceof Redirect) return navigate(e.href, true);
        if (e instanceof NotFound) return setView(await resolve(createElement(Layout, null, createElement(NotFoundView)))), setShown(key);
        console.error(e);
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return createElement(
    RouteContext.Provider,
    { value: route },
    error ? createElement(ErrorView, { error, reset: () => setTick((n) => n + 1) }) : (view ?? createElement(Loading)),
  );
}
