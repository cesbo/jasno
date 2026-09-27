import { component, computed, each, h, show, signal } from 'jasno';
import type { ViewProps } from 'jasno/router';
import type { Person } from '../api.ts';
import { router } from '../routes.ts';

export default component(function PeopleView(p: ViewProps<'/', readonly Person[]>): Node {
  const q = computed(() => router.url().searchParams.get('q') ?? '');
  const shown = computed(() => {
    const needle = q().trim().toLowerCase();
    return p.data().filter((x) => `${x.name} ${x.email} ${x.phone}`.toLowerCase().includes(needle));
  });
  // Row UI state lives here, not in the row: a row dies when the filter hides it.
  const expanded = signal<ReadonlySet<string>>(new Set());
  const toggle = (id: string): void => expanded.update((s) => {
    const next = new Set(s);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return h.section(null,
    h.h1(null, 'Contacts'),
    h.search(null, h.label(null, 'Search ', h.input({
      type: 'search', value: q,
      oninput: (e) => {
        const v = e.currentTarget.value;
        void router.navigate(v ? '?q=' + encodeURIComponent(v) : router.url().pathname, { replace: true });
      },
    }))),
    h.p({ role: 'status' }, () => `${shown().length} of ${p.data().length} contacts`),
    show(() => shown().length === 0, () => h.p(null, 'No contacts match your search.')),
    h.ul({ class: 'people' }, each(shown, { key: (x) => x.id, render: (person, _i, id) => {
      const notesId = `notes-${id}`;
      return h.li(null,
        h.a({ href: router.href('/people/:id', { id }) }, () => person().name),
        h.div(null, () => person().email),
        show(() => person().notes, () => h.button({
          type: 'button',
          'aria-expanded': () => expanded().has(id),
          'aria-controls': notesId,
          'aria-label': () => `Notes for ${person().name}`,
          onclick: () => toggle(id),
        }, 'Notes')),
        h.p({ id: notesId, hidden: () => !expanded().has(id) }, () => person().notes));
    } })));
});
