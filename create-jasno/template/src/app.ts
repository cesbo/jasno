import { component, h } from 'jasno';
import { router } from './routes.ts';

export const App = component(function App(): Node {
  return h.div(null,
    h.header(null, h.nav({ 'aria-label': 'Main' },
      h.a({ href: router.href('/') }, 'Home'), ' ',
      h.a({ href: router.href('/about') }, 'About'))),
    h.main(null, router.outlet()));
});
