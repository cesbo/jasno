import { component, h } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
import type { User } from '../api.ts';
export default component(function UserView(p: ViewProps<'/users/:id', User>): Node {
  return h.h1(null, () => `${p.data().name} (#${p.params().id})`);
});
