// AGENTS.md "Testing", verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush } from 'jasno';
import { mountTest } from 'jasno/testing';
import { TodoList } from './todo-list.ts';

test('filters', (t) => {
  const view = mountTest(t, () => TodoList({ todos: () => [{ id: 1, text: 'milk', done: false }], onToggle: () => {} }));
  const input = view.root.querySelector('input')!;
  input.focus();
  input.value = 'milk';
  input.dispatchEvent(new Event('input'));
  flush(); // async work: await settled() from 'jasno/testing'
  assert.equal(view.root.querySelectorAll('li').length, 1);
});
