import { h } from 'jasno';
import { createRouter, route } from 'jasno/router';

export const router = createRouter([
  route('/', { view: () => import('./views/board.ts'), title: 'Board · Kanban' }),
], {
  error: (error, retry) => h.div({ role: 'alert' },
    h.h1(null, 'Something went wrong'), h.p(null, String(error)), h.button({ type: 'button', onclick: retry }, 'Try again')),
  notFound: () => h.div(null, h.h1(null, 'Page not found'), h.a({ href: '/' }, 'Back to the board')),
});
