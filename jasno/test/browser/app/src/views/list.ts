import { component, computed, h, match, onMount } from 'jasno';
import { router } from '../routes.ts';

const CardDialog = component(function CardDialog(p: { id: string; heading: HTMLElement }): Node {
  const dialog = h.dialog({ 'aria-labelledby': 'card-title', onclose: () => {
      if (dialog.contains(document.activeElement)) p.heading.focus();
      if (router.url().searchParams.get('card') === p.id) void router.back(router.url().pathname); } },
    h.h2({ id: 'card-title' }, 'Card ', p.id), h.form({ method: 'dialog' }, h.button({ id: 'card-close' }, 'Close')));
  onMount(() => { dialog.showModal(); return () => dialog.close(); });
  return dialog;
});

export default component(function ListView(): Node {
  const q = computed(() => router.url().searchParams.get('q') ?? '');
  const cardId = computed(() => router.url().searchParams.get('card'));
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);
  const heading = h.h1({ tabIndex: -1 }, 'List');
  return h.section(null,
    heading,
    h.label(null, 'Search ', h.input({ id: 'q', value: q,
      oninput: (e) => { void router.navigate('?q=' + encodeURIComponent(e.currentTarget.value), { replace: true }); } })),
    h.p({ id: 'qout' }, q),
    h.form({ action: '/search', method: 'get', id: 'getform' }, h.input({ name: 'q', id: 'getq', 'aria-label': 'Query' }), h.button({ id: 'getgo' }, 'Go')),
    h.form({ action: '/a', method: 'post', id: 'postform' }, h.input({ name: 'x', value: '1', 'aria-label': 'X' }), h.button({ id: 'postgo' }, 'Post')),
    h.a({ href: '?sort=asc', id: 'sort' }, 'Sort'), ' ',
    h.a({ href: '#section', id: 'hash' }, 'Jump'),
    h.ul(null, ...rows.map((i) => h.li({ style: 'height:40px' }, h.a({ href: '?card=' + i, id: 'card' + i }, 'Open ' + i)))),
    h.h2({ id: 'section' }, 'Section'),
    h.div({ style: 'height:1500px' }, 'filler'),
    h.a({ href: '/a', id: 'bottom-a' }, 'Bottom A'),
    match(cardId, (id) => (id === null ? '' : CardDialog({ id: id as string, heading }))),
  );
});
