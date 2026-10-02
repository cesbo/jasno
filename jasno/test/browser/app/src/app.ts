import { component, h, show } from '@jasno/core';
import { router } from './routes.ts';

export const App = component(function App(): Node {
  return h.div(null,
    h.header(null, h.nav({ 'aria-label': 'Main' },
      h.a({ href: router.href('/'), id: 'nav-home' }, 'Home'), ' ',
      h.a({ href: router.href('/a'), id: 'nav-a' }, 'A'), ' ',
      h.a({ href: router.href('/b'), id: 'nav-b' }, 'B'), ' ',
      h.a({ href: router.href('/dlg'), id: 'nav-dlg' }, 'Dialog'), ' ',
      h.a({ href: router.href('/lazy'), id: 'nav-lazy' }, 'Lazy'), ' ',
      h.a({ href: router.href('/guard'), id: 'nav-guard' }, 'Guard'), ' ',
      h.a({ href: router.href('/slow'), id: 'nav-slow' }, 'Slow'), ' ',
      h.a({ href: router.href('/broken'), id: 'nav-broken' }, 'Broken'), ' ', h.a({ href: router.href('/probe'), id: 'nav-probe' }, 'Probe'), ' ', h.a({ href: router.href('/gated'), id: 'nav-gated' }, 'Gated'), ' ', h.a({ href: router.href('/nohead'), id: 'nav-nohead' }, 'NoHead'), ' ',
      h.a({ href: '/assets/plain.html', id: 'nav-plain' }, 'Plain'), ' ',
      h.a({ href: '/nope', id: 'nav-nope' }, 'Nope'), ' ',
      h.a({ href: '/a', download: 'a.html', id: 'nav-download' }, 'Download'), ' ',
      h.a({ href: '/a', target: '_self', id: 'nav-self' }, 'Self'),
    ), show(router.isLoading, () => h.progress({ 'aria-label': 'Loading page' }))),
    h.main(null, router.outlet()),
  );
});
