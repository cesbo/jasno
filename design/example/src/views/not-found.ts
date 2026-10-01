import { component, h, onMount } from '@jasno/core';
import { router } from '../routes.ts';

// Rendered by the router for URLs that match no route (createRouter's notFound option).
export const NotFound = component(function NotFound(): Node {
  onMount(() => { document.title = 'Page not found'; }); // one-time work: onMount, not an effect that reads nothing
  return h.section(null,
    h.h1(null, 'Page not found'),
    h.p(null, h.a({ href: router.href('/') }, 'Back to people')),
  );
});
