// RECIPES "Layout": the layout module a route names; p.view once, outside show/match.
import { component, h } from '@jasno/core';
import type { LayoutProps } from '@jasno/core/router';
import { router } from '../routes.ts';

const DocsNav = component(function DocsNav(): Node {
  return h.nav({ 'aria-label': 'Docs' }, h.a({ href: router.href('/docs/:page', { page: 'intro' }), 'aria-current': () => (router.url().pathname === '/docs/intro' ? 'page' : null) }, 'Intro'));
});
export default component(function DocsLayout(p: LayoutProps): Node {
  return h.div({ class: 'docs' }, DocsNav(), p.view);
});
