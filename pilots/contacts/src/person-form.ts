import { component, h, signal, untracked, type Read } from 'jasno';
import type { Draft } from './api.ts';

export interface PersonFormProps {
  initial: Read<Draft>;
  submitLabel: string;
  /** Saves the draft; resolves with the text to announce. */
  save: (draft: Draft) => Promise<string>;
}

// The draft lives in the form's own inputs: create one PersonForm per record (inside match on the id).
export const PersonForm = component(function PersonForm(p: PersonFormProps): Node {
  const seed = untracked(p.initial);
  const saving = signal(false);
  const message = signal('');
  const form: HTMLFormElement = h.form({ onsubmit: (e) => { e.preventDefault(); return submit(); } },
    h.label(null, 'Name', h.input({ name: 'name', required: true, pattern: '.*\\S.*', value: seed.name })),
    h.label(null, 'Email', h.input({ name: 'email', type: 'email', value: seed.email })),
    h.label(null, 'Phone', h.input({ name: 'phone', type: 'tel', value: seed.phone })),
    h.label(null, 'Notes', h.textarea({ name: 'notes', rows: 3, value: seed.notes })),
    h.button({ type: 'submit', 'aria-disabled': saving }, p.submitLabel),
    h.p({ role: 'status' }, message));

  async function submit(): Promise<void> {
    if (saving()) return;
    const data = new FormData(form);
    const text = (k: keyof Draft): string => String(data.get(k) ?? '').trim();
    saving.set(true);
    message.set('Saving…');
    try {
      message.set(await p.save({ name: text('name'), email: text('email'), phone: text('phone'), notes: text('notes') }));
    } catch {
      message.set('Not saved. Please try again.');
    } finally {
      saving.set(false);
    }
  }
  return form;
});
