import { h } from 'jasno';
import { createRouter, route } from 'jasno/router';

export const router = createRouter([
  route('/', { view: () => import('./views/dashboard.ts'), title: 'Dashboard' }),
  route('/settings', { view: () => import('./views/settings.ts'), title: 'Settings' }),
], {
  error: (error, retry) => h.div({ role: 'alert' },
    h.h1(null, 'Something went wrong'),
    h.p(null, error instanceof Error ? error.message : String(error)),
    h.button({ type: 'button', onclick: retry }, 'Try again')),
  notFound: () => h.div(null, h.h1(null, 'Page not found'), h.a({ href: '/' }, 'Go to the dashboard')),
});
