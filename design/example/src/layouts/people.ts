import { component, h } from '@jasno/core';
import type { LayoutProps } from '@jasno/core/router';
import { notes } from '../state.ts';

// The people section: '/' and '/users/:id' name this layout, so it stays while the person changes and only the view
// inside it is built again. Section-wide UI goes here (a page list, filters); this one counts the notes.
export default component(function PeopleLayout(p: LayoutProps): Node {
  return h.div({ class: 'people' }, p.view,
    h.p({ class: 'notes-total' }, () => { const n = notes().length; return `${n} ${n === 1 ? 'note' : 'notes'} in this browser`; }));
});
