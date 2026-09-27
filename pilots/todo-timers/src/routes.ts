import { h } from 'jasno';
import { createRouter, route } from 'jasno/router';

export const router = createRouter([
  route('/', { view: () => import('./views/todos.ts') }),
], {
  error: (_error, retry) => h.div({ role: 'alert' },
    h.p(null, 'Something went wrong.'), h.button({ type: 'button', onclick: retry }, 'Retry')),
  notFound: () => h.div(null, h.h1(null, 'Page not found'), h.a({ href: '/' }, 'Back to the task list')),
});
