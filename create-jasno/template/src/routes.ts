import { h } from '@jasno/core';
import { createRouter, route } from '@jasno/core/router';

export const router = createRouter([
  route('/', { view: () => import('./views/home.ts'), title: 'Home' }),
  route('/about', { view: () => import('./views/about.ts'), title: 'About' }),
], {
  error: (error, retry) => h.section(null, h.h1(null, 'Something went wrong'),
    h.p(null, error instanceof Error ? error.message : 'Unknown error'),
    h.button({ type: 'button', onclick: retry }, 'Try again')),
  notFound: () => h.h1(null, 'Page not found'),
});
