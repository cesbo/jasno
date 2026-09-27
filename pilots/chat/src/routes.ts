import { h } from 'jasno';
import { createRouter, route } from 'jasno/router';

export const router = createRouter([
  route('/', { view: () => import('./views/home.ts'), title: 'Chat' }),
  route('/rooms/:id', { view: () => import('./views/room.ts') }),
], {
  error: (error, retry) => h.section(null,
    h.h1(null, 'Something went wrong'),
    h.p(null, error instanceof Error ? error.message : String(error)),
    h.button({ type: 'button', onclick: retry }, 'Try again')),
  notFound: () => h.section(null, h.h1(null, 'Page not found'), h.a({ href: '/' }, 'Back to rooms')),
});
