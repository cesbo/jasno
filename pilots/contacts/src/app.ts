import { component, css, h } from 'jasno';
import { router } from './routes.ts';

css`
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 42rem; padding: 0 1rem; }
  .app header nav { display: flex; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #ccc; }
  .app label { display: block; margin: 0.5rem 0; }
  .app input, .app textarea { display: block; width: 100%; box-sizing: border-box; font: inherit; }
  .app [aria-disabled="true"] { opacity: 0.6; }
  .app .people li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
  .app .people { list-style: none; padding: 0; }
  .app .around { display: flex; justify-content: space-between; margin-top: 2rem; }
`;

export const App = component(function App(): Node {
  return h.div({ class: 'app' },
    h.header(null, h.nav({ 'aria-label': 'Main' },
      h.a({ href: router.href('/') }, 'Contacts'),
      h.a({ href: router.href('/people/new') }, 'Add person'),
      h.span({ role: 'status' }, () => (router.isLoading() ? 'Loading…' : '')))),
    h.main(null, router.outlet()));
});
