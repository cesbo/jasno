import { component, css, h, onMount, provide, show, signal } from '@jasno/core';
import { router } from './routes.ts';
import { syncNotes } from './state.ts';
import { ToastContext, ToastRegion, type Toast, type ToastItem } from './toast.ts';

css`
  .app { max-width: 48rem; margin: 0 auto; font: 16px/1.5 system-ui, sans-serif; }
  .app > header { display: flex; gap: 1rem; align-items: center; }
`;

// The shell: header with navigation, then <main> holding the routed view (the router focuses the view's h1).
export const App = component(function App(): Node {
  const toasts = signal<readonly ToastItem[]>([]);
  let nextId = 1;
  const toast: Toast = (message) => toasts.update((list) => [...list, { id: nextId++, message }]);
  const dismiss = (id: number) => toasts.update((list) => list.filter((t) => t.id !== id));
  onMount(syncNotes); // notes saved in another tab appear here too; the returned cleanup unsubscribes

  return provide(ToastContext, toast, () =>
    h.div({ class: 'app' },
      h.header(null,
        h.nav({ 'aria-label': 'Main' }, h.a({ href: router.href('/') }, 'People')),
        show(router.isLoading, () => h.progress({ 'aria-label': 'Loading page' })),
      ),
      h.main(null, router.outlet()),
      ToastRegion({ toasts, dismiss }),
    ));
});
