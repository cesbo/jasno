import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, provide } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { ToastContext } from '../toast.ts';
import { NoteForm } from './note-form.ts';

test('submits the trimmed draft, clears it and reports through the toast context', async (t) => {
  const saved: string[] = [];
  const toasts: string[] = [];
  const view = mountTest(t, () =>
    provide(ToastContext, (message) => toasts.push(message), () =>
      NoteForm({ onSave: async (text) => { saved.push(text); } })));

  const textarea = view.root.querySelector('textarea');
  const form = view.root.querySelector('form');
  assert.ok(textarea && form);
  textarea.focus(); // type as a user would: focus first
  textarea.value = '  call back on Monday  ';
  textarea.dispatchEvent(new Event('input'));
  form.requestSubmit();
  await settled(); // settled() waits for the promise the async submit handler returns

  assert.deepEqual(saved, ['call back on Monday']);
  assert.deepEqual(toasts, ['Note saved']);
  assert.equal(textarea.value, '');
  assert.equal(view.root.querySelector('button')?.textContent, 'Add note');
});

test('keeps text typed while the save is in flight', async (t) => {
  let finish = (): void => {};
  const view = mountTest(t, () =>
    provide(ToastContext, () => {}, () =>
      NoteForm({ onSave: () => new Promise<void>((resolve) => { finish = resolve; }) })));

  const textarea = view.root.querySelector('textarea');
  const form = view.root.querySelector('form');
  assert.ok(textarea && form);
  textarea.focus();
  textarea.value = 'first';
  textarea.dispatchEvent(new Event('input'));
  form.requestSubmit();
  flush();
  textarea.value = 'second';
  textarea.dispatchEvent(new Event('input'));
  finish();
  await settled();

  assert.equal(textarea.value, 'second');
});
