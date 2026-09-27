import { h } from 'jasno';
import { createRouter, route } from 'jasno/router';

const wait = (ms: number, s: AbortSignal) => new Promise<void>((ok, fail) => {
  const t = setTimeout(ok, ms); s.addEventListener('abort', () => { clearTimeout(t); fail(s.reason); });
});

export const router = createRouter([
  route('/', { view: () => import('./views/list.ts'), title: 'List' }),
  route('/a', { view: () => import('./views/a.ts'), title: 'Page A' }),
  route('/b', { view: () => import('./views/b.ts') }),
  route('/dlg', { view: () => import('./views/dlg.ts'), title: 'Dialog page' }),
  route('/search', { view: () => import('./views/search.ts'), title: 'Search' }),
  route('/lazy', { view: () => import('./views/lazy.ts'), title: 'Lazy' }),
  route('/slow', {
    loader: async ({ abortSignal }) => { await wait(800, abortSignal); return null; },
    view: () => import('./views/a.ts'), title: 'Slow',
  }),
  route('/guard', {
    loader: async () => { void router.navigate('/a', { replace: true }); return null; },
    view: () => import('./views/a.ts'), title: 'Guarded',
  }),
  route('/probe', {
    loader: async () => { (window as any).__loaderSaw = { path: location.pathname, entry: new URL((navigation as any).currentEntry.url).pathname }; return null; },
    view: () => import('./views/a.ts'),
  }),
  route('/gated', {
    loader: async () => { if ((window as any).__deny) void router.navigate('/a', { replace: true }); return null; },
    view: () => import('./views/lazy.ts'), title: 'Gated',
  }),
  route('/nohead', { view: () => import('./views/nohead.ts') }),
  route('/broken', { view: () => import('./views/missing.ts'), title: 'Broken' }),
], {
  error: (error, retry) => h.section(null, h.h1(null, 'Something went wrong'), h.p(null, String(error)),
    h.button({ type: 'button', onclick: retry }, 'Try again')),
  notFound: () => h.section(null, h.h1(null, 'Page not found')),
});
