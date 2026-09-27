import { component, computed, h, onMount, show, signal, untracked, type Read } from 'jasno';
import {
  elapsedOf, formatDuration, removeTodo, renameTodo, startTimer, stopTimer, toggleDone, type Filter, type Todo,
} from './state.ts';

export interface TodoRowProps {
  id: string;
  todo: Read<Todo>;
  now: Read<number>;
  filter: Read<Filter>;
  /** Gets focus when this row leaves the list and no neighbour row is left. */
  fallbackFocus: HTMLElement;
  announce: (message: string) => void;
}

export const TodoRow = component(function TodoRow(p: TodoRowProps): Node {
  const elapsed = computed(() => elapsedOf(p.todo(), p.now()));
  const running = computed(() => p.todo().startedAt !== null);
  const editing = signal(false);
  let refocus = false; // set on the Enter/Escape paths only, so tabbing away never pulls focus back

  // Called before a write that removes this row: focus must land on something that stays.
  const handOffFocus = (): void => {
    const neighbour = row.nextElementSibling ?? row.previousElementSibling;
    (neighbour?.querySelector('input') ?? p.fallbackFocus).focus();
  };

  const title = show(editing, () => {
    const commit = (again: boolean): void => {
      refocus = again;
      editing.set(false);
      const text = input.value.trim();
      if (text && text !== p.todo().text) renameTodo(p.id, text);
    };
    const input = h.input({
      value: untracked(p.todo).text, 'aria-label': `New name for ${untracked(p.todo).text}`,
      onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); refocus = true; editing.set(false); } },
      onblur: () => { if (editing()) commit(false); }, // Chromium also fires blur when the input is removed
    });
    onMount(() => { input.focus(); input.select(); });
    return h.form({ class: 'rename', onsubmit: (e) => { e.preventDefault(); commit(true); } }, input);
  }, () => {
    const button = h.button({
      type: 'button', class: 'title', 'aria-label': () => `Rename ${p.todo().text}`, onclick: () => editing.set(true),
    }, () => p.todo().text);
    if (refocus) { refocus = false; onMount(() => button.focus()); }
    return button;
  });

  const row = h.li({ class: { done: () => p.todo().done, running } },
    h.input({
      type: 'checkbox', checked: () => p.todo().done, 'aria-label': () => `Done: ${p.todo().text}`,
      onchange: () => { if (p.filter() !== 'all') handOffFocus(); toggleDone(p.id); },
    }),
    title,
    h.span({ class: 'time' }, () => formatDuration(elapsed())),
    h.button({
      type: 'button', 'aria-label': () => `${running() ? 'Stop' : 'Start'} timer for ${p.todo().text}`,
      onclick: () => (running() ? stopTimer(p.id) : startTimer(p.id)),
    }, () => (running() ? 'Stop' : 'Start')),
    h.button({
      type: 'button', 'aria-label': () => `Delete ${p.todo().text}`,
      onclick: () => { const { text } = p.todo(); handOffFocus(); removeTodo(p.id); p.announce(`Deleted “${text}”`); },
    }, 'Delete'),
  );
  return row;
});
