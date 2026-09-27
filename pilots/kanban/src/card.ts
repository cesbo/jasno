import { component, css, h, onMount, show, signal, untracked, type Read } from 'jasno';
import type { Card, Column } from './api.ts';
import { removeCard, rename } from './state.ts';

export const COLUMNS: readonly { readonly id: Column; readonly name: string }[] = [
  { id: 'todo', name: 'To do' },
  { id: 'doing', name: 'Doing' },
  { id: 'done', name: 'Done' },
];

export interface CardItemProps {
  card: Read<Card>;
  /** Fixed for the row's life, like column: a card that changes column gets a new row in the other list. */
  id: string;
  column: Column;
  /** Focus the title on creation: the card moved here while it held focus. */
  focus: boolean;
  onMove: (to: Column) => Promise<void>;
}

css`
.card { background: var(--card-bg); border: 1px solid var(--line); border-radius: 6px; padding: 8px; margin: 0 0 8px; list-style: none;
  .card-title { display: block; width: 100%; text-align: left; font: inherit; font-weight: 600; background: none; border: 0; padding: 4px; cursor: text; }
  .card-title:hover { background: var(--hover); }
  input { width: 100%; box-sizing: border-box; font: inherit; font-weight: 600; padding: 3px; }
  .actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; font-size: 0.85em; }
}
`;

export const CardItem = component(function CardItem(p: CardItemProps): Node {
  const title = (): string => p.card().title;
  const editing = signal(false);
  let refocus = p.focus; // set on the Enter/Escape paths only, so tabbing away never pulls focus back

  const confirm = h.dialog({ 'aria-labelledby': `delete-${p.id}`, onclose: (e) => {
      if (e.currentTarget.returnValue !== 'yes') return;
      // This row is about to go: hand focus to a neighbour card, else to the column heading.
      const neighbour = li.nextElementSibling ?? li.previousElementSibling;
      (neighbour?.querySelector<HTMLElement>('.card-title') ?? li.closest('.column')?.querySelector('h2'))?.focus();
      return removeCard(p.id);
    } },
    h.form({ method: 'dialog' },
      h.h2({ id: `delete-${p.id}` }, 'Delete “', title, '”?'),
      h.button({ value: 'no', autofocus: true }, 'Cancel'), ' ',
      h.button({ value: 'yes' }, 'Delete')));

  const here = COLUMNS.findIndex((c) => c.id === p.column);
  const li: HTMLLIElement = h.li({ class: 'card', 'data-id': p.id },
    show(editing, () => {
      const commit = (again: boolean): Promise<void> | undefined => {
        refocus = again;
        editing.set(false);
        const text = input.value.trim();
        if (text && text !== p.card().title) return rename(p.id, text);
        return undefined;
      };
      const input = h.input({ value: untracked(p.card).title, 'aria-label': 'Title',
        onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); refocus = true; editing.set(false); } },
        onblur: () => { if (editing()) void commit(false); } }); // Chromium also fires blur when the input is removed
      onMount(() => { input.focus(); input.select(); });
      return h.form({ onsubmit: (e) => { e.preventDefault(); return commit(true); } }, input);
    }, () => {
      const button = h.button({ type: 'button', class: 'card-title', 'aria-label': () => `Edit ${title()}`, onclick: () => editing.set(true) }, title);
      if (refocus) { refocus = false; onMount(() => button.focus()); }
      return button;
    }),
    h.div({ class: 'actions' },
      h.a({ href: `?card=${encodeURIComponent(p.id)}`, 'aria-label': () => `Details for ${title()}` }, 'Details'),
      COLUMNS.map((c, i) => (i === here ? null : h.button({ type: 'button', 'aria-label': () => `Move ${title()} to ${c.name}`,
        onclick: () => p.onMove(c.id) }, i < here ? `← ${c.name}` : `${c.name} →`))),
      h.button({ type: 'button', 'aria-label': () => `Delete ${title()}`, onclick: () => confirm.showModal() }, 'Delete')),
    confirm);
  return li;
});
