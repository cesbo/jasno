import { component, effect, h } from 'jasno';
import { router } from './routes.ts';
import { save, todos } from './state.ts';

export const App = component(function App(): Node {
  effect(() => save(todos()));
  return h.main(null, router.outlet());
});
