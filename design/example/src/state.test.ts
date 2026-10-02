import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { addNote, notes, NOTES_KEY, syncNotes } from './state.ts';

// No mountTest here, so nothing resets the module signal: each test starts and ends with empty notes and storage.
function fresh(t: TestContext): void {
  localStorage.clear();
  notes.set([]);
  t.after(() => { localStorage.clear(); notes.set([]); });
}
const stored = (): unknown => JSON.parse(localStorage.getItem(NOTES_KEY) ?? 'null');
const fromOtherTab = (raw: string): void => {
  localStorage.setItem(NOTES_KEY, raw);
  window.dispatchEvent(new StorageEvent('storage', { key: NOTES_KEY }));
};

test('addNote stores the note, then shows it', (t) => {
  fresh(t);
  addNote('1', 'call back on Monday');
  assert.deepEqual(notes().map((n) => [n.userId, n.text]), [['1', 'call back on Monday']]);
  assert.deepEqual(stored(), notes());
});

test('when storage refuses the write, addNote throws and nothing is shown', (t) => {
  fresh(t);
  t.mock.method(localStorage, 'setItem', () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); });
  assert.throws(() => addNote('1', 'lost'), { name: 'QuotaExceededError' });
  assert.deepEqual(notes(), []);
});

test('addNote keeps a note another tab stored before its storage event arrived', (t) => {
  fresh(t);
  const other = { id: 'n1', userId: '2', text: 'from tab B', createdAt: '2026-10-01T00:00:00Z' };
  localStorage.setItem(NOTES_KEY, JSON.stringify([other])); // no event yet
  addNote('1', 'from tab A');
  assert.deepEqual(notes().map((n) => n.text), ['from tab B', 'from tab A']);
});

test('syncNotes shows what another tab stored, drops entries of another shape, reads broken JSON as none', (t) => {
  fresh(t);
  const stop = syncNotes();
  const note = { id: 'n1', userId: '1', text: 'from tab B', createdAt: '2026-10-01T00:00:00Z' };
  fromOtherTab(JSON.stringify([note, { id: 2 }, null]));
  assert.deepEqual(notes(), [note]);
  fromOtherTab('{broken');
  assert.deepEqual(notes(), []);
  stop();
  fromOtherTab(JSON.stringify([note]));
  assert.deepEqual(notes(), [], 'no updates after the cleanup');
});
