// AGENTS.md "Routing" inline forms: the app shell, per-param work in a match body, closing a detail.
import { component, h, match, onMount } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
import { router } from './routes.ts';

const nav = h.nav({ 'aria-label': 'Main' }, h.a({ href: router.href('/') }, 'Home'));
export const App = component(function App(): Node {
  return h.div(null, h.header(null, nav), h.main(null, router.outlet()));
});
const Body = component(function Body(p: { id: string }): Node {
  onMount(() => { document.title = `User ${p.id}`; });
  return h.p(null, p.id);
});
export const UserPage = component(function UserPage(p: ViewProps<'/users/:id'>): Node {
  return h.section(null, h.h1(null, 'User'), match(() => p.params().id, (id) => Body({ id })),
    h.button({ type: 'button', onclick: () => void router.back('/') }, 'Close'));
});
