// AGENTS.md "Routing".
import { component, h } from 'jasno';
import { createRouter, route } from 'jasno/router';
import { getUser } from './api.ts';
const ErrorPanel = component(function ErrorPanel(p: { error: unknown; retry: () => void }): Node {
  return h.section({ role: 'alert' }, h.h1(null, 'Something went wrong'), String(p.error), h.button({ onclick: p.retry }, 'Retry'));
});
const NotFound = component(function NotFound(): Node { return h.h1(null, 'Page not found'); });
export const router = createRouter([
  route('/', { view: () => import('./views/home.ts'), title: 'Home' }),
  route('/users/new', { view: () => import('./views/home.ts'), title: 'New user' }),
  route('/users/:id', { loader: ({ params, abortSignal }) => getUser(params.id, abortSignal), view: () => import('./views/user.ts'), title: (u) => u.name }),
  route('/settings/:tab(profile|billing)', { view: () => import('./views/settings.ts'), title: 'Settings' }),
], { error: (error, retry) => ErrorPanel({ error, retry }), notFound: () => NotFound() });
export async function afterDelete(): Promise<void> {
  const result = await router.navigate('/', { replace: true });
  if (result === 'failed') console.warn('navigation failed');
}
export const q = () => router.url().searchParams.get('q') ?? '';
export const setQ = (v: string) => void router.navigate('?q=' + encodeURIComponent(v), { replace: true });
