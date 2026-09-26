import { component, h } from 'jasno';
import { router } from '../routes.ts';
export default component(function Home(): Node {
  return h.section(null, h.h1(null, 'Home'), h.a({ href: router.href('/users/:id', { id: 7 }) }, 'Ada'), h.a({ href: '?q=ada' }, 'Search'));
});
