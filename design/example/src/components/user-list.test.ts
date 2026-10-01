import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, signal } from '@jasno/core';
import { mountTest } from '@jasno/core/testing';
import type { User } from '../api.ts';
import { UserList } from './user-list.ts';

const ada: User = { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', team: 'Engines' };
const alan: User = { id: '2', name: 'Alan Turing', email: 'alan@example.com', team: 'Codebreaking' };

function type(input: HTMLInputElement, value: string): void {
  input.focus(); // as a user would: focus left on a row that the filter removes is FOCUS_LOST
  input.value = value;
  input.dispatchEvent(new Event('input'));
  flush(); // apply DOM updates now instead of on the next microtask
}

test('filters people and reuses rows when the data is refreshed', (t) => {
  const users = signal<readonly User[]>([ada, alan]);
  const view = mountTest(t, () => UserList({ users, hrefFor: (u) => `/users/${u.id}` }));
  const rows = () => [...view.root.querySelectorAll('li')];
  const input = view.root.querySelector('input');
  assert.ok(input);

  assert.deepEqual(rows().map((li) => li.querySelector('a')?.getAttribute('href')), ['/users/1', '/users/2']);
  type(input, 'turing');
  assert.deepEqual(rows().map((li) => li.textContent), ['Alan Turing · Codebreaking']);
  assert.equal(view.root.querySelector('[aria-live]')?.textContent, '1 of 2 people');

  type(input, '');
  const alanRow = rows()[1];
  users.set([ada, { ...alan, team: 'Computing' }]); // same key, new object: the row is updated in place
  flush();
  assert.equal(rows()[1], alanRow);
  assert.match(alanRow?.textContent ?? '', /Computing/);
});

test('"Show more" reveals the next page, moves focus to it, and a new query resets it', (t) => {
  const many: User[] = Array.from({ length: 45 }, (_, i) => ({ id: String(i), name: `Person ${i}`, email: '', team: 'T' }));
  const view = mountTest(t, () => UserList({ users: () => many, hrefFor: (u) => `/users/${u.id}` }));
  const count = () => view.root.querySelectorAll('li').length;
  const more = () => [...view.root.querySelectorAll('button')].find((b) => b.textContent === 'Show more');

  assert.equal(count(), 20);
  more()?.click();
  assert.equal(count(), 40);
  assert.equal(document.activeElement?.textContent, 'Person 20'); // focus moved to the first new row
  more()?.click(); // the last page: the button disappears, focus is already on a row
  assert.equal(count(), 45);
  assert.equal(document.activeElement?.textContent, 'Person 40');
  const input = view.root.querySelector('input');
  assert.ok(input);
  type(input, 'Person');
  assert.equal(count(), 20);
});
