import { component, h } from 'jasno';
import { router } from '../routes.ts';

export const NotFound = component(function NotFound(): Node {
  return h.section(null,
    h.h1(null, 'Page not found'),
    h.p(null, h.a({ href: router.href('/') }, 'Back to all contacts')));
});

export const ErrorView = component(function ErrorView(p: { error: unknown; retry: () => void }): Node {
  return h.section(null,
    h.h1(null, 'Something went wrong'),
    h.p(null, p.error instanceof Error ? p.error.message : 'Unknown error'),
    h.p(null, h.button({ type: 'button', onclick: p.retry }, 'Try again'), ' ', h.a({ href: router.href('/') }, 'All contacts')));
});
