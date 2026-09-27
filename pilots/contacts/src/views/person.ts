import { component, computed, effect, h, linkedSignal, match, resource, show, signal, untracked, type Read } from 'jasno';
import type { ViewProps } from 'jasno/router';
import { deletePerson, listPeople, savePerson } from '#api';
import type { Person } from '../api.ts';
import { PersonForm } from '../person-form.ts';
import { router } from '../routes.ts';

export default component(function PersonView(p: ViewProps<'/people/:id', Person | null>): Node {
  // Writable copy of the loader data: a save shows its result at once; the next route data replaces it.
  const person = linkedSignal({ source: p.data, computation: (d) => d });
  // The view stays mounted when only :id changes, so a save that finishes later writes only to its own record.
  const onSaved = (saved: Person): void => { if (p.params().id === saved.id) person.set(saved); };
  effect(() => { document.title = person()?.name ?? 'Contact not found'; });
  // Previous/next links: loaded once, the view stays mounted while :id changes.
  const all = resource({ loader: ({ abortSignal }) => listPeople(abortSignal) });
  const around = computed(() => {
    const list = all.hasValue() ? all.value() : [];
    const i = list.findIndex((x) => x.id === p.params().id);
    return i < 0 ? {} : { prev: list[i - 1], next: list[i + 1] };
  });
  const link = (label: string, x: Read<Person>): Node =>
    h.a({ href: () => router.href('/people/:id', { id: x().id }) }, label, () => x().name);

  return h.section(null,
    h.h1(null, () => person()?.name ?? 'Contact not found'),
    match(() => person()?.id ?? null, (id) => {
      const seed = untracked(person);
      return id === null || seed === null
        ? h.p(null, 'This contact does not exist or was deleted. ', h.a({ href: router.href('/') }, 'Back to all contacts'))
        : PersonBody({ id, seed, name: () => person()?.name ?? seed.name, onSaved });
    }),
    h.nav({ 'aria-label': 'Other contacts', class: 'around' },
      show(() => around().prev, (x) => link('Previous: ', x)),
      show(() => around().next, (x) => link('Next: ', x))));
});

interface BodyProps { id: string; seed: Person; name: Read<string>; onSaved: (saved: Person) => void }

const PersonBody = component(function PersonBody(p: BodyProps): Node {
  const deleting = signal(false);
  const message = signal('');
  const dialog = h.dialog({ 'aria-labelledby': 'delete-title',
    onclose: (e) => { if (e.currentTarget.returnValue === 'yes') return remove(); } },
  h.form({ method: 'dialog' },
    h.h2({ id: 'delete-title' }, () => `Delete ${p.name()}?`),
    h.p(null, 'This cannot be undone.'),
    h.button({ value: 'no', autofocus: true }, 'Cancel'), ' ',
    h.button({ value: 'yes' }, 'Delete')));

  async function remove(): Promise<void> {
    const url = router.href('/people/:id', { id: p.id });
    deleting.set(true);
    message.set('Deleting…');
    try {
      await deletePerson(p.id, AbortSignal.timeout(10_000));
      if (router.url().pathname === url) await router.navigate('/', { replace: true });
    } catch {
      message.set('Not deleted. Please try again.');
      deleting.set(false);
    }
  }

  return h.div(null,
    PersonForm({ initial: () => p.seed, submitLabel: 'Save', save: async (draft) => {
      p.onSaved(await savePerson({ id: p.id, ...draft }, AbortSignal.timeout(10_000)));
      return 'Saved.';
    } }),
    h.button({ type: 'button', 'aria-disabled': deleting,
      onclick: () => { if (deleting()) return; dialog.returnValue = ''; dialog.showModal(); } }, 'Delete contact'),
    h.p({ role: 'status' }, message),
    dialog);
});
