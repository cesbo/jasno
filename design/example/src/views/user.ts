import { component, each, h, match, resource, show, svg } from '@jasno/core';
import type { ViewProps } from '@jasno/core/router';
import { addNote, listNotes } from '#api';
import type { User } from '../api.ts';
import { NoteForm } from '../components/note-form.ts';
import { router } from '../routes.ts';

const backIcon = () =>
  svg.svg({ viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' },
    svg.path({ d: 'M15 18l-6-6 6-6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }));

// Route '/users/:id'. The view stays mounted when only :id changes, so params and data are Reads.
export default component(function UserView(p: ViewProps<'/users/:id', User>): Node {
  const notes = resource({
    params: () => p.params().id, // tracked: a new :id aborts the old request and loads again
    loader: ({ params: userId, abortSignal }) => listNotes(userId, abortSignal),
    debugName: 'notes',
  });

  const status = h.p({ role: 'status', tabIndex: -1 }, () =>
    notes.status() === 'loading' ? 'Loading notes…' : notes.status() === 'error' ? 'Could not load notes.' : '');

  async function save(id: string, text: string): Promise<void> {
    await addNote(id, text);
    if (p.params().id === id) notes.reload(); // reload() refetches the current params, so it cannot mix people up
  }

  return h.article(null,
    h.p(null, h.a({ href: router.href('/') }, backIcon(), ' All people')),
    h.h1(null, () => p.data().name),
    h.p(null, () => `${p.data().email} · ${p.data().team}`),
    h.h2(null, 'Notes'),
    status,
    show(() => notes.status() === 'error', () =>
      h.button({ type: 'button', onclick: () => { status.focus(); notes.reload(); } }, 'Retry')),
    h.ul(null,
      each(() => (notes.hasValue() ? notes.value() : []), {
        key: (n) => n.id,
        render: (note) => h.li(null, () => note().text, ' ',
          h.small(null, () => new Date(note().createdAt).toLocaleDateString())),
      })),
    // A new :id disposes the old form with its draft and saving flag; a late save cannot touch the new one.
    match(() => p.params().id, (id) => NoteForm({ onSave: (text) => save(id, text) })),
  );
});
