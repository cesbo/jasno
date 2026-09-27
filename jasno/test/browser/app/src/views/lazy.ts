import { component, h } from 'jasno';
export default component(function LazyView(): Node {
  return h.section(null, h.h1(null, 'Lazy'));
});
