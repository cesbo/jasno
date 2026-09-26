import { component, computed, h, linkedSignal, signal, useContext, type Read } from 'jasno';
import { ToastContext } from '../toast.ts';

export interface NoteFormProps {
  userId: Read<string>;
  onSave: (text: string) => Promise<void>;
}

const MAX = 280;

export const NoteForm = component(function NoteForm(p: NoteFormProps): Node {
  const toast = useContext(ToastContext); // read context in setup, keep the value
  // The draft belongs to one person: it resets to '' whenever the userId value changes.
  const text = linkedSignal({ source: p.userId, computation: () => '' });
  const saving = signal(false);
  const left = computed(() => MAX - text().length);

  return h.form({
    // Fires only when native validation passes (required, maxLength).
    onsubmit: async (e) => {
      e.preventDefault();
      if (saving()) return; // the button stays focusable while saving; aria-disabled tells assistive tech
      saving.set(true);
      try {
        await p.onSave(text().trim());
        text.set('');
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
