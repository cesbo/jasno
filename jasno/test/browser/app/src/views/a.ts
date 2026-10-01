import { component, h } from '@jasno/core';
export default component(function AView(): Node {
  return h.section(null, h.h1(null, 'Page A'), h.div({ style: 'height:3000px' }, 'tall'), h.a({ href: '/', id: 'a-home' }, 'Home'));
});
