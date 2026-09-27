import { component, h, onMount } from 'jasno';
export default component(function DlgView(): Node {
  const d = h.dialog({ 'aria-labelledby': 'dt' }, h.h2({ id: 'dt' }, 'Welcome'),
    h.form({ method: 'dialog' }, h.button({ id: 'dlg-ok', autofocus: true }, 'OK')));
  onMount(() => { d.showModal(); return () => d.close(); });
  return h.section(null, h.h1(null, 'Dialog page'), h.button({ type: 'button', autofocus: true, id: 'hidden-af', hidden: true }, 'x'), d);
});
