import { component, h } from '@jasno/core';

export default component(function AboutView(): Node {
  return h.section(null, h.h1(null, 'About'), h.p(null, 'A jasno app.'));
});
