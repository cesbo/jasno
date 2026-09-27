import { createRouter, route } from 'jasno/router';
import { getPerson, listPeople } from '#api';
import { ErrorView, NotFound } from './views/fallback.ts';

export const router = createRouter([
  route('/', { loader: ({ abortSignal }) => listPeople(abortSignal), view: () => import('./views/people.ts'), title: 'Contacts' }),
  route('/people/new', { view: () => import('./views/new.ts'), title: 'Add person' }),
  route('/people/:id', { loader: ({ params, abortSignal }) => getPerson(params.id, abortSignal), view: () => import('./views/person.ts') }),
], { error: (error, retry) => ErrorView({ error, retry }), notFound: () => NotFound() });
