import { createRouter, route } from '@jasno/core/router';
import { getUser } from '#api';
import { ErrorPanel } from './components/error-panel.ts';
import { NotFound } from './views/not-found.ts';

// The whole route table: specific routes before param routes. Loaders start with the navigation; views are lazy.
export const router = createRouter([
  route('/', { view: () => import('./views/users.ts'), title: 'People' }),
  route('/users/:id', {
    loader: ({ params, abortSignal }) => getUser(params.id, abortSignal),
    view: () => import('./views/user.ts'),
    title: (user) => user.name,
  }),
], {
  error: (error, retry) => ErrorPanel({ error, retry }),
  notFound: () => NotFound(),
});
