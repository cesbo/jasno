import { component, h } from 'jasno';
export default component(function BView(): Node {
  return h.section(null, h.h1(null, 'Page B heading'), h.label(null, 'Name ', h.input({ id: 'bname', autofocus: true })));
});
