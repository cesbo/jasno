import { component, css, effect, h, onMount } from 'jasno';
import { router } from './routes.ts';
import { pageVisible, pollMs } from './state.ts';

css`body { margin: 0; font-family: system-ui, sans-serif; color: #1c1c28; background: #f7f8fb; }
.app {
  header { background: #1c1c28; padding: 0.5rem 1rem; nav { display: flex; gap: 1rem; } a { color: #fff; } a[aria-current="page"] { font-weight: 700; } }
  main { max-width: 64rem; margin: 0 auto; padding: 1rem; }
  :focus-visible { outline: 2px solid #3355cc; outline-offset: 2px; }
}`;

export const App = component(function App(): Node {
  onMount(({ abortSignal }) => document.addEventListener('visibilitychange',
    () => pageVisible.set(!document.hidden), { signal: abortSignal }));
  effect(() => { try { localStorage.setItem('pollMs', String(pollMs())); } catch { /* storage blocked: keep in memory */ } });
  const link = (path: string, text: string) =>
    h.a({ href: path, 'aria-current': () => (router.url().pathname === path ? 'page' : null) }, text);
  return h.div({ class: 'app' },
    h.header(null, h.nav({ 'aria-label': 'Main' }, link(router.href('/'), 'Dashboard'), link(router.href('/settings'), 'Settings'))),
    h.main(null, router.outlet()));
});
