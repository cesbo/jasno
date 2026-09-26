import { component, h, resource, show } from 'jasno';
import { listUsers } from '#api';
import { UserList } from '../components/user-list.ts';
import { router } from '../routes.ts';

// Route '/': a resource without params loads once when the view is created.
export default component(function UsersView(): Node {
  const users = resource({ loader: ({ abortSignal }) => listUsers(abortSignal), debugName: 'users' });
  // The status line exists before its text changes, so screen readers announce it; Retry moves focus here first.
  const status = h.p({ role: 'status', tabIndex: -1 }, () =>
    users.status() === 'loading' ? 'Loading people…' : users.status() === 'error' ? 'Could not load people.' : '');

  return h.section(null,
    h.h1(null, 'People'),
    status,
    show(() => users.status() === 'error', () =>
      h.button({ type: 'button', onclick: () => { status.focus(); users.reload(); } }, 'Retry')),
    show(() => users.hasValue() && users.value(), (list) =>
      UserList({ users: list, hrefFor: (u) => router.href('/users/:id', { id: u.id }) })),
  );
});
