import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsedOf, formatDuration, parseTodos } from './state.ts';

test('parseTodos keeps valid todos and drops malformed or duplicate ones', () => {
  const good = { id: 'a', text: ' milk ', done: false, elapsedMs: 1500, startedAt: null };
  const running = { id: 'b', text: 'bread', done: true, elapsedMs: 0, startedAt: 1000 };
  const raw = JSON.stringify([
    good, running,
    { ...good },                                   // duplicate id
    { ...good, id: 'c', text: '   ' },             // blank text
    { ...good, id: 'd', done: 'no' },              // wrong type
    { ...good, id: 'e', elapsedMs: -1 },           // negative time
    { ...good, id: 'f', startedAt: 'yesterday' },  // bad timestamp
    { ...good, id: 'g', elapsedMs: null },         // missing time
    null, 42, 'x',
  ]);
  assert.deepEqual(parseTodos(raw), [{ ...good, text: 'milk' }, running]);
});

test('parseTodos returns [] for missing, broken or non-array data', () => {
  assert.deepEqual(parseTodos(null), []);
  assert.deepEqual(parseTodos('{not json'), []);
  assert.deepEqual(parseTodos('{"id":"a"}'), []);
});

test('elapsed time comes from the clock and never goes negative', () => {
  const t = { id: 'a', text: 'x', done: false, elapsedMs: 5000, startedAt: 10_000 };
  assert.equal(elapsedOf(t, 12_500), 7500);
  assert.equal(elapsedOf(t, 9000), 5000); // the clock lags a fresh start
  assert.equal(elapsedOf({ ...t, startedAt: null }, 99_999), 5000);
  assert.equal(formatDuration(3_725_999), '1:02:05');
});
