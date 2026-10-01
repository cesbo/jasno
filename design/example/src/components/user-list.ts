import { component, computed, css, each, flush, h, linkedSignal, selector, show, signal, type Read } from '@jasno/core';
import type { User } from '../api.ts';

export interface UserListProps {
  users: Read<readonly User[]>;
  hrefFor: (user: User) => string;
}

const PAGE = 20;

// Component-named root class plus native nesting; sheets are global, so every rule starts with .user-list.
css`
  .user-list {
    .team { color: GrayText; }
    ul { padding: 0; }
    li.current { font-weight: 600; }
  }
`;

export const UserList = component(function UserList(p: UserListProps): Node {
  const query = signal('');
  const matches = computed(() => {
    const q = query().trim().toLowerCase();
    if (q === '') return p.users();
    return p.users().filter((u) => u.name.toLowerCase().includes(q) || u.team.toLowerCase().includes(q));
  });
  // Writable derived state: "Show more" raises the limit; a new query resets it to one page.
  const limit = linkedSignal({ source: query, computation: () => PAGE });
  const visible = computed(() => matches().slice(0, limit()));
  // Highlight the row last hovered or focused: each row re-runs only when its own answer flips.
  const current = signal<string | null>(null);
  const isCurrent = selector(current);

  const list = h.ul(null,
    each(visible, {
      key: (u) => u.id,
      render: (user, _index, id) =>
        h.li({ class: { current: () => isCurrent(id) }, onpointerenter: () => current.set(id), onfocusin: () => current.set(id) },
          h.a({ href: () => p.hrefFor(user()) }, () => user().name),
          ' · ',
          h.span({ class: 'team' }, () => user().team)),
    }));
  // "Show more" disappears after the last page while it has focus (FOCUS_LOST): focus the first new link instead.
  const showMore = (): void => {
    const first = limit();
    limit.update((n) => n + PAGE);
    flush(); // build the new rows now, so one of them can take focus
    list.querySelectorAll('a')[first]?.focus();
  };

  return h.div({ class: 'user-list' },
    h.label(null, 'Filter ',
      h.input({ type: 'search', value: query, oninput: (e) => query.set(e.currentTarget.value) })),
    h.p({ 'aria-live': 'polite' }, () => `${matches().length} of ${p.users().length} people`),
    list,
    show(() => matches().length > limit(), () => h.button({ type: 'button', onclick: showMore }, 'Show more')),
  );
});
