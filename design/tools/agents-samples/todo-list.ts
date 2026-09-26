// AGENTS.md "Example", verbatim.
import { component, computed, each, h, show, signal, type Read } from 'jasno';

export interface Todo { readonly id: number; readonly text: string; readonly done: boolean }
export interface TodoListProps { todos: Read<readonly Todo[]>; onToggle: (id: number) => void }

export const TodoList = component(function TodoList(p: TodoListProps): Node {
  const query = signal('');
  const shown = computed(() => p.todos().filter((t) => t.text.includes(query())));
  return h.section(null,
    h.input({ value: query, oninput: (e) => query.set(e.currentTarget.value), 'aria-label': 'Filter' }),
    show(() => shown().length === 0, () => h.p(null, 'No matches')),
    h.ul(null, each(shown, { key: (t) => t.id, render: (todo) =>
      h.li({ class: { done: () => todo().done } },
        h.button({ onclick: () => p.onToggle(todo().id) }, () => todo().text)) })),
    h.p(null, () => `${shown().length} shown`),
  );
});
