import { component, computed, each, h, match, svg } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
import type { User } from '../api.ts';
import { NoteForm } from '../components/note-form.ts';
import { router } from '../routes.ts';
import { addNote, notes } from '../state.ts';

const backIcon = () =>
  svg.svg({ viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' },
    svg.path({ d: 'M15 18l-6-6 6-6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }));

// Route '/users/:id'. The view stays mounted when only :id changes, so params and data are Reads. The person comes
// from the route loader (the server); the notes are this browser's (state.ts).
export default component(function UserView(p: ViewProps<'/users/:id', User>): Node {
  const mine = computed(() => notes().filter((n) => n.userId === p.params().id));

  return h.article(null,
    h.p(null, h.a({ href: router.href('/') }, backIcon(), ' All people')),
    h.h1(null, () => p.data().name),
    h.p(null, () => `${p.data().email} · ${p.data().team}`),
    h.h2(null, 'Notes'),
    h.ul(null,
      each(mine, {
        key: (n) => n.id,
        render: (note) => h.li(null, () => note().text, ' ',
          h.small(null, () => new Date(note().createdAt).toLocaleDateString())),
      })),
    // A new :id disposes the old form with its draft and saving flag; a late save cannot touch the new one.
    match(() => p.params().id, (id) => NoteForm({ onSave: async (text) => addNote(id, text) })),
  );
});
