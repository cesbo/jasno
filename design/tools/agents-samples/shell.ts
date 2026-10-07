// AGENTS.md "Routing" inline forms: the app shell, per-param work in the view (a new :id builds a new view), closing a detail.
import { component, h, onMount } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
import { router } from './routes.ts';

const nav = h.nav({ 'aria-label': 'Main' }, h.a({ href: router.href('/') }, 'Home'));
export const App = component(function App(): Node {
  return h.div(null, h.header(null, nav), h.main(null, router.outlet()));
});
export const UserPage = component(function UserPage(p: ViewProps<'/users/:id'>): Node {
  const id = p.params().id;
  onMount(() => { document.title = `User ${id}`; });
  return h.section(null, h.h1(null, 'User'), h.p(null, id),
    h.button({ type: 'button', onclick: () => void router.back('/') }, 'Close'));
});
