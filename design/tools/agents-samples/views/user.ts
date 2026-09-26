import { component, h } from 'jasno';
import type { ViewProps } from 'jasno/router';
import type { User } from '../api.ts';
export default component(function UserView(p: ViewProps<'/users/:id', User>): Node {
  return h.h1(null, () => `${p.data().name} (#${p.params().id})`);
});
