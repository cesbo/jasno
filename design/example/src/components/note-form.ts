import { component, computed, h, signal, useContext } from '@jasno/core';
import { ToastContext } from '../toast.ts';

export interface NoteFormProps {
  onSave: (text: string) => Promise<void>;
}

const MAX = 280;

// One form per person: UserView creates it inside match() on the id, so a draft or a save never crosses records.
export const NoteForm = component(function NoteForm(p: NoteFormProps): Node {
  const toast = useContext(ToastContext); // read context in setup, keep the value
  const text = signal('');
  const saving = signal(false);
  const left = computed(() => MAX - text().length);

  return h.form({
    // Fires only when native validation passes (required, maxLength).
    onsubmit: async (e) => {
      e.preventDefault();
      if (saving()) return; // the button stays focusable while saving; aria-disabled tells assistive tech
      const sent = text();
      saving.set(true);
      try {
        await p.onSave(sent.trim());
        if (text() === sent) text.set(''); // keep what was typed while the save was in flight
        toast('Note saved');
      } catch (err) {
        toast(`Could not save the note: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        saving.set(false);
      }
    },
  },
    h.label(null, 'New note',
      h.textarea({
        name: 'text',
        required: true,
        maxLength: MAX,
        rows: 3,
        value: text,
        oninput: (e) => text.set(e.currentTarget.value),
      })),
    h.p({ class: { warn: () => left() < 20 } }, () => `${left()} characters left`),
    h.button({ type: 'submit', 'aria-disabled': saving }, () => (saving() ? 'Saving…' : 'Add note')),
  );
});
