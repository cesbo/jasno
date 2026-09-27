import { component, computed, css, each, h, match, onMount, show } from 'jasno';
import type { Column } from '../api.ts';
import { COLUMNS, CardItem } from '../card.ts';
import { router } from '../routes.ts';
import { addCard, cards, move } from '../state.ts';

css`
.board {
  .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-items: start; }
  .column { background: var(--column-bg); border-radius: 8px; padding: 8px; }
  .column ul { padding: 0; margin: 0; min-height: 8px; }
  .column form { display: flex; gap: 4px; }
  .column form input { flex: 1; min-width: 0; }
}
dialog.detail { min-width: min(420px, 90vw); }
`;

export default component(function BoardView(): Node {
  const heading = h.h1({ tabIndex: -1 }, 'Board');
  const cardId = computed(() => router.url().searchParams.get('card'));
  // The card that holds focus. When it changes column (a move, or the undo of a failed one) its new row takes focus.
  let follow: string | null = null;
  const status = h.p({ role: 'status', tabIndex: -1 },
    () => (cards.status() === 'error' ? 'The board could not be loaded.' : cards.hasValue() ? '' : 'Loading the board…'));

  const columnSection = (col: (typeof COLUMNS)[number]): Node => {
    const list = computed(() => (cards.hasValue() ? cards.value().filter((c) => c.column === col.id) : []));
    const input = h.input({ required: true, 'aria-label': `New card in ${col.name}`, placeholder: 'Add a card' });
    return h.section({ class: 'column', 'aria-labelledby': `col-${col.id}` },
      h.h2({ id: `col-${col.id}`, tabIndex: -1 }, col.name),
      h.ul(null, each(list, { key: (c) => c.id, render: (card, _index, id) => CardItem({ card, id, column: col.id, focus: follow === id,
        onMove: (to: Column) => { follow = id; return move(id, to); } }) })),
      h.form({ onsubmit: (e) => {
          e.preventDefault();
          const title = input.value.trim();
          input.value = '';
          return title ? addCard(title, col.id) : undefined;
        } },
        input, h.button({ type: 'submit' }, 'Add')));
  };

  return h.div({ class: 'board', onfocusin: (e) => {
      follow = e.target instanceof Element ? (e.target.closest<HTMLElement>('.card')?.dataset['id'] ?? null) : null;
    } },
    heading,
    status,
    show(() => cards.status() === 'error', () => h.button({ type: 'button', onclick: () => { status.focus(); cards.reload(); } }, 'Retry')),
    show(() => cards.hasValue(), () => h.div({ class: 'columns' }, COLUMNS.map(columnSection))),
    match(cardId, (id) => (id === null ? '' : CardDialog({ id, heading }))));
});

/** Card detail over the board, opened by ?card=<id>: Back or Close closes it, and deep links work. */
const CardDialog = component(function CardDialog(p: { id: string; heading: HTMLElement }): Node {
  const card = computed(() => (cards.hasValue() ? (cards.value().find((c) => c.id === p.id) ?? null) : undefined));
  const dialog = h.dialog({ class: 'detail', 'aria-labelledby': 'card-title', onclose: () => { // close also fires after Back removed it
      // A deep link has no opener to return to. By this event Firefox and WebKit may already have moved focus to <body>.
      const active = document.activeElement;
      if (active === null || active === document.body || dialog.contains(active)) p.heading.focus();
      // Only a live dialog navigates: after Back or an unmount the event arrives for a detached one.
      if (dialog.isConnected && router.url().searchParams.get('card') === p.id) void router.back(router.url().pathname);
    } },
    h.h2({ id: 'card-title' }, () => { const c = card(); return c === undefined ? 'Loading…' : c === null ? 'Card not found' : c.title; }),
    show(card, (c) => h.dl(null,
      h.dt(null, 'Column'), h.dd(null, () => COLUMNS.find((col) => col.id === c().column)?.name),
      h.dt(null, 'Id'), h.dd(null, p.id))),
    h.form({ method: 'dialog' }, h.button({ autofocus: true }, 'Close')));
  onMount(() => { dialog.showModal(); return () => dialog.close(); });
  return dialog;
});
