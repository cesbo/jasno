import { component, h } from 'jasno';

export default component(function HomeView(): Node {
  return h.section(null, h.h1(null, 'Home'), h.p(null, 'Edit src/views/home.ts to start.'));
});
