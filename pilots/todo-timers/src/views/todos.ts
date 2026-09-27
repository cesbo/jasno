import { component, computed, css, each, h, onMount, show, signal } from 'jasno';
import { router } from '../routes.ts';
import { addTodo, elapsedOf, FILTERS, formatDuration, todos, type Filter } from '../state.ts';
import { TodoRow } from '../todo-row.ts';

css`
  .todo-app { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem;
    .add { display: flex; gap: .5rem; align-items: center; }
    .filters ul, .todos { list-style: none; padding: 0; }
    .filters ul { display: flex; gap: 1rem; }
    .filters [aria-current] { font-weight: 700; }
    .todos li { display: flex; gap: .5rem; align-items: center; padding: .25rem 0; }
    .todos .title { flex: 1; text-align: start; background: none; border: 0; padding: .25rem; font: inherit; cursor: text; }
    .todos .rename { flex: 1; display: flex; }
    .todos .rename input { flex: 1; font: inherit; }
    .todos .done .title { text-decoration: line-through; opacity: .7; }
    .todos .running .time { font-weight: 700; }
    .time, .total { font-variant-numeric: tabular-nums; }
    :focus-visible { outline: 2px solid #1a5fb4; outline-offset: 2px; }
  }
`;

const LABELS: Record<Filter, string> = { all: 'All', active: 'Active', done: 'Done' };

export default component(function TodosView(): Node {
  const filter = computed((): Filter => {
    const f = router.url().searchParams.get('filter');
    return f === 'active' || f === 'done' ? f : 'all';
  });
  // The clock: elapsed time is derived from it, so a missed or late tick never loses time.
  const now = signal(Date.now());
  onMount(() => { const t = setInterval(() => now.set(Date.now()), 1000); return () => clearInterval(t); });

  const shown = computed(() => {
    const f = filter();
    return f === 'all' ? todos() : todos().filter((t) => t.done === (f === 'done'));
  });
  const total = computed(() => todos().reduce((sum, t) => sum + elapsedOf(t, now()), 0));
  const status = signal('');

  const newText = h.input({ required: true, autocomplete: 'off' });
  const addForm = h.form({
    class: 'add',
    onsubmit: (e) => {
      e.preventDefault();
      const text = newText.value.trim();
      if (!text) return;
      addTodo(text);
      newText.value = '';
      status.set(`Added “${text}”${filter() === 'done' ? ' (hidden by the Done filter)' : ''}`);
    },
  }, h.label(null, 'New task ', newText), h.button({ type: 'submit' }, 'Add'));

  const filters = h.nav({ class: 'filters', 'aria-label': 'Filter tasks' }, h.ul(null, FILTERS.map((f) =>
    h.li(null, h.a({
      href: f === 'all' ? router.href('/') : `?filter=${f}`,
      'aria-current': () => (filter() === f ? 'page' : undefined),
    }, LABELS[f])))));

  return h.section({ class: 'todo-app' },
    h.h1(null, 'Todo timers'),
    addForm,
    filters,
    h.ul({ class: 'todos', 'aria-label': 'Tasks' }, each(shown, {
      key: (t) => t.id,
      render: (todo, _index, id) => TodoRow({ id, todo, now, filter, fallbackFocus: newText, announce: status.set }),
    })),
    show(() => shown().length === 0, () => h.p(null, () => (filter() === 'all' ? 'No tasks yet.' : `No ${filter()} tasks.`))),
    h.p({ class: 'total' }, 'Total time: ', () => formatDuration(total())),
    h.p({ role: 'status' }, () => status()),
  );
});
