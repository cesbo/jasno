// RECIPES "Router": a redirecting loader on a data route resolves null, so the view takes ViewProps<P, User | null>.
import { component, h } from 'jasno';
import type { ViewProps } from 'jasno/router';
import type { User } from '../api.ts';
export default component(function Account(p: ViewProps<'/account/:id', User | null>): Node {
  return h.h1(null, () => p.data()?.name ?? '');
});
