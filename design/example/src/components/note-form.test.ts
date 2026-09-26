import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provide } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { ToastContext } from '../toast.ts';
import { NoteForm } from './note-form.ts';

test('submits the trimmed draft, clears it and reports through the toast context', async (t) => {
  const saved: string[] = [];
  const toasts: string[] = [];
  const view = mountTest(t, () =>
    provide(ToastContext, (message) => toasts.push(message), () =>
      NoteForm({ userId: () => '1', onSave: async (text) => { saved.push(text); } })));

  const textarea = view.root.querySelector('textarea');
  const form = view.root.querySelector('form');
  assert.ok(textarea && form);
  textarea.value = '  call back on Monday  ';
  textarea.dispatchEvent(new Event('input'));
  form.requestSubmit();
  await settled(); // the submit handler is async: wait for it and for the DOM updates it causes

  assert.deepEqual(saved, ['call back on Monday']);
  assert.deepEqual(toasts, ['Note saved']);
  assert.equal(textarea.value, '');
  assert.equal(view.root.querySelector('button')?.textContent, 'Add note');
});
