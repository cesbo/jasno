import { component, css, effect, h } from 'jasno';
import { router } from './routes.ts';
import { notice } from './state.ts';

css`
:root { --line: #d0d4dc; --card-bg: #fff; --column-bg: #eef0f4; --hover: #f3f5f9; --focus: #2457d6; color-scheme: light; }
body { margin: 0; font: 15px/1.4 system-ui, sans-serif; background: #f8f9fb; color: #1d2330; }
.app { max-width: 1100px; margin: 0 auto; padding: 0 16px 48px; }
.app header nav a { font-weight: 700; text-decoration: none; color: inherit; }
.app header { padding: 12px 0; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.notice:empty { display: none; }
.notice { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #1d2330; color: #fff; padding: 8px 16px; border-radius: 6px; }
`;

export const App = component(function App(): Node {
  effect(() => { // a notice fades after a while
    if (!notice()) return;
    const timer = setTimeout(() => notice.set(''), 8000);
    return () => clearTimeout(timer);
  });
  return h.div({ class: 'app' },
    h.header(null, h.nav({ 'aria-label': 'Main' }, h.a({ href: router.href('/') }, 'Kanban'))),
    h.main(null, router.outlet()),
    h.p({ class: 'notice', role: 'status' }, notice));
});
