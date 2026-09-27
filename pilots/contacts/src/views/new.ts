import { component, h } from 'jasno';
import { savePerson } from '#api';
import { PersonForm } from '../person-form.ts';
import { router } from '../routes.ts';

const empty = { name: '', email: '', phone: '', notes: '' };

export default component(function NewPersonView(): Node {
  const id = crypto.randomUUID(); // idempotency key: a retry after a timeout cannot create a duplicate
  return h.section(null,
    h.h1(null, 'Add person'),
    PersonForm({ initial: () => empty, submitLabel: 'Add person', save: async (draft) => {
      await savePerson({ id, ...draft }, AbortSignal.timeout(10_000));
      if (router.url().pathname === router.href('/people/new')) {
        void router.navigate(router.href('/people/:id', { id }), { replace: true });
      }
      return 'Added.';
    } }));
});
