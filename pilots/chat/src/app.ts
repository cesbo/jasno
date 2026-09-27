import { component, computed, css, each, h, onMount, show } from 'jasno';
import { subscribeRooms } from '#api';
import { router } from './routes.ts';
import { dismiss, rooms, toasts, unread } from './state.ts';

css`
  body { margin: 0; font-family: system-ui, sans-serif; }
  .app { display: grid; grid-template-columns: 14rem 1fr; min-height: 100vh; }
  .app > header { border-right: 1px solid #ddd; padding: 1rem; }
  .app > main { padding: 1rem; min-width: 0; }
  .app nav ul { list-style: none; padding: 0; margin: 0; }
  .app nav a { display: flex; justify-content: space-between; padding: 0.35rem 0.5rem; border-radius: 4px; }
  .app nav a[aria-current='page'] { background: #e8eefc; font-weight: 600; }
  .app .badge { background: #2456d3; color: #fff; border-radius: 999px; padding: 0 0.5rem; font-size: 0.8rem; }
  .app .toasts { position: fixed; right: 1rem; bottom: 1rem; list-style: none; margin: 0; padding: 0; }
  .app .toasts li { background: #222; color: #fff; padding: 0.5rem 0.75rem; margin-top: 0.5rem; border-radius: 6px; }
`;

export const App = component(function App(): Node {
  onMount(() => subscribeRooms(rooms.set));
  return h.div({ class: 'app' },
    h.header(null, h.a({ href: '/' }, 'Chat'), RoomNav()),
    h.main(null, router.outlet()),
    ToastRegion());
});

const RoomNav = component(function RoomNav(): Node {
  return h.nav({ 'aria-label': 'Rooms' }, h.h2(null, 'Rooms'), h.ul(null, each(rooms, { key: (r) => r.id,
    render: (room, _i, id) => {
      const href = router.href('/rooms/:id', { id });
      const count = computed(() => unread(room()));
      return h.li(null, h.a({ href, 'aria-current': () => (router.url().pathname === href ? 'page' : undefined) },
        h.span(null, () => `#${room().name}`), ' ',
        show(() => count() > 0, () => h.span({ class: 'badge' }, () => `${count()} unread`))));
    } })));
});

// Recipe: one live region that exists before messages arrive; each row owns its timer.
const ToastRegion = component(function ToastRegion(): Node {
  const region: HTMLUListElement = h.ul({ class: 'toasts', 'aria-live': 'polite', 'aria-label': 'Notifications', tabIndex: -1 },
    each(toasts, { key: (t) => t.id, render: (t, _i, id) => {
      const close = (): void => {
        if (row.contains(document.activeElement)) {
          ((row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button') ?? region).focus();
        }
        dismiss(id);
      };
      onMount(() => { const timer = setTimeout(close, 8000); return () => clearTimeout(timer); });
      const row = h.li(null, () => t().text, ' ', h.button({ type: 'button', onclick: close, 'aria-label': 'Dismiss' }, '×'));
      return row;
    } }));
  return region;
});
