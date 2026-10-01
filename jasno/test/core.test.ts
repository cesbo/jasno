import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computed, createRoot, effect, flush, linkedSignal, onMount, selector, signal, untracked } from '@jasno/core';
import { nodeOf, type SignalNode } from '../src/core.ts';
import { capture, codeOf, tick } from './helpers.ts';

// ---------------------------------------------------------------- the eight pinned behaviours (ADR-11)

test('pinned 1: a throwing computed caches its error and rethrows the same object', () => {
  const s = signal(1);
  let calls = 0;
  const c = computed(() => { calls++; if (s() > 0) throw new Error('boom'); return s(); });
  const dispose = createRoot((d) => { effect(() => { try { c(); } catch { /* observed */ } }); return d; });
  flush();
  let a: unknown, b: unknown;
  try { c(); } catch (e) { a = e; }
  try { c(); } catch (e) { b = e; }
  assert.ok(a instanceof Error);
  assert.equal(a, b);
  assert.equal(calls, 1);
  s.set(-1);
  assert.equal(c(), -1);
  dispose();
});

test('pinned 2: equality is Object.is (NaN is equal to itself, -0 differs from +0)', () => {
  const s = signal(NaN);
  let runs = 0;
  const dispose = createRoot((d) => { effect(() => { s(); runs++; }); return d; });
  flush();
  s.set(NaN); flush();
  assert.equal(runs, 1);
  s.set(0); flush();
  s.set(-0); flush();
  assert.equal(runs, 3);
  dispose();
});

test('pinned 3: an effect that writes its own source is re-queued and reported', () => {
  const cap = capture();
  const n = signal(5, { debugName: 'n' });
  let runs = 0;
  const dispose = createRoot((d) => { effect(() => { runs++; if (n() > 3) n.set(n() - 1); }, { debugName: 'clamp' }); return d; });
  flush();
  cap.stop();
  assert.equal(n(), 3);
  assert.equal(runs, 3);
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
  assert.equal(cap.diags[0]!.count, 2);
  dispose();
});

test('pinned 4: writes never run effects synchronously; the flush is a microtask', async () => {
  const s = signal(0);
  const double = computed(() => s() * 2);
  const seen: number[] = [];
  const dispose = createRoot((d) => { effect(() => { seen.push(double()); }); return d; });
  await tick();
  s.set(1);
  assert.equal(double(), 2); // read-your-writes
  assert.deepEqual(seen, [0]);
  await Promise.resolve();
  assert.deepEqual(seen, [0, 2]);
  dispose();
});

test('pinned 5: consumers dropped at the loop cap stay subscribed and are re-armed', () => {
  const on = signal(true);
  const n = signal(0);
  let runs = 0;
  const dispose = createRoot((d) => { effect(() => { runs++; const v = n(); if (on()) n.set(v + 1); }); return d; });
  const cap = capture();
  assert.throws(() => flush(), (e) => codeOf(e) === 'EFFECT_LOOP');
  const before = runs;
  on.set(false);
  flush();
  cap.stop();
  assert.equal(runs, before + 1, 'the effect ran again after the cap');
  n.set(0);
  flush();
  assert.equal(runs, before + 2, 'and still tracks its sources');
  dispose();
});

test('pinned 6: cleanups run at most once; self-stop runs the returned cleanup when the run returns', () => {
  const s = signal(0);
  const log: string[] = [];
  let stop = () => {};
  let aborted: boolean | undefined;
  const dispose = createRoot((d) => {
    stop = effect(({ abortSignal }) => {
      const v = s();
      if (v === 1) { stop(); aborted = abortSignal.aborted; }
      return () => log.push(`cleanup ${v}`);
    });
    return d;
  });
  flush();
  s.set(1); flush();
  assert.deepEqual(log, ['cleanup 0', 'cleanup 1']);
  assert.equal(aborted, true, 'the abort fires at once');
  stop(); dispose();
  s.set(2); flush();
  assert.deepEqual(log, ['cleanup 0', 'cleanup 1']);
});

test('pinned 7: an unobserved computed recomputes on every read and keeps no links', () => {
  const s = signal(1);
  let calls = 0;
  const c = computed(() => { calls++; return s() * 2; });
  assert.equal(c(), 2);
  assert.equal(c(), 2);
  assert.equal(calls, 2);
  assert.equal((nodeOf(s as unknown as Function) as SignalNode).subs, undefined);
});

test('pinned 8: linkedSignal settles a pending recomputation before a local write', () => {
  const src = signal('a');
  const l = linkedSignal({ source: src, computation: (v: string) => v + '!' });
  assert.equal(l(), 'a!');
  src.set('b');
  l.set('local'); // the source change is settled first, so the local value survives the next read
  assert.equal(l(), 'local');
  src.set('c');
  assert.equal(l(), 'c!');
  // observed variant
  const seen: string[] = [];
  const dispose = createRoot((d) => { effect(() => { seen.push(l()); }); return d; });
  flush();
  src.set('d'); l.set('mine'); flush();
  assert.deepEqual(seen, ['c!', 'mine']);
  dispose();
});

// ---------------------------------------------------------------- semantics

test('B1.4 glitch-free: a diamond runs its consumer once per change with consistent values', () => {
  const a = signal(1);
  const b = computed(() => a() + 1);
  const c = computed(() => a() * 10);
  const seen: string[] = [];
  const dispose = createRoot((d) => { effect(() => { seen.push(`${b()}/${c()}`); }); return d; });
  flush();
  a.set(2); flush();
  assert.deepEqual(seen, ['2/10', '3/20']);
  dispose();
});

test('B2.3 an equal computed value does not re-run consumers; custom equal works', () => {
  const s = signal(1);
  const parity = computed(() => s() % 2);
  const obj = signal({ id: 1 }, { equal: (x, y) => x.id === y.id });
  let runs = 0;
  const dispose = createRoot((d) => { effect(() => { parity(); obj(); runs++; }); return d; });
  flush();
  s.set(3); obj.set({ id: 1 }); flush();
  assert.equal(runs, 1);
  dispose();
});

test('B5.1 writes in a derivation throw WRITE_IN_DERIVATION, untracked does not exempt', () => {
  const s = signal(0, { debugName: 'target' });
  const c = computed(() => { untracked(() => s.set(1)); return 1; }, { debugName: 'bad' });
  assert.throws(() => c(), (e) => codeOf(e) === 'WRITE_IN_DERIVATION' && /target/.test(String(e)) && /bad/.test(String(e)));
  assert.equal(s(), 0);
});

test('B4.2 flush() inside a derivation throws FLUSH_REENTRANT', () => {
  const c = computed(() => { flush(); return 1; });
  assert.throws(() => c(), (e) => codeOf(e) === 'FLUSH_REENTRANT');
});

test('B6.11 effects created in a derivation throw OWNED_IN_DERIVATION', () => {
  const c = computed(() => { effect(() => {}); return 1; });
  assert.throws(() => c(), (e) => codeOf(e) === 'OWNED_IN_DERIVATION');
});

test('B4.3 effects run after bindings, in creation order; onMount runs untracked once', () => {
  const s = signal(0);
  const log: string[] = [];
  const dispose = createRoot((d) => {
    effect(() => { log.push(`e1:${s()}`); });
    onMount(() => { log.push(`mount:${s()}`); });
    effect(() => { log.push(`e2:${s()}`); });
    return d;
  });
  flush();
  s.set(1); flush();
  assert.deepEqual(log, ['e1:0', 'mount:0', 'e2:0', 'e1:1', 'e2:1']);
  dispose();
});

test('B6.3 disposal: children first, then abort, then cleanups in reverse; computeds read afterwards are uncached', () => {
  const log: string[] = [];
  const s = signal(1);
  let c!: () => number;
  const dispose = createRoot((d) => {
    c = computed(() => s() * 2);
    createRoot(() => { onMount(() => () => log.push('child cleanup')); });
    onMount(({ abortSignal }) => {
      abortSignal.addEventListener('abort', () => log.push('abort'));
      return () => log.push(`parent cleanup ${c()}`);
    });
    onMount(() => () => log.push('second cleanup'));
    effect(() => { c(); });
    return d;
  });
  flush();
  dispose();
  assert.deepEqual(log, ['child cleanup', 'abort', 'second cleanup', 'parent cleanup 2']);
  s.set(5);
  assert.equal(c(), 10);
  dispose();
  assert.equal(log.length, 4, 'dispose is idempotent');
});

test('B8.3 errors in effects go to report() and the flush continues', () => {
  const cap = capture();
  const s = signal(0);
  let ok = 0;
  const dispose = createRoot((d) => {
    effect(() => { if (s() === 1) throw new Error('bad effect'); });
    effect(() => { s(); ok++; });
    return d;
  });
  flush();
  s.set(1); flush();
  cap.stop();
  assert.equal(ok, 2);
  assert.equal((cap.errors[0] as Error).message, 'bad effect');
  s.set(2); flush();
  dispose();
});

test('B21 selector dirties only the consumers of the old and new key', () => {
  const sel = signal<number | null>(null);
  const runs = new Map<number, number>();
  const dispose = createRoot((d) => {
    const is = selector(sel);
    for (const k of [1, 2, 3]) effect(() => { is(k); runs.set(k, (runs.get(k) ?? 0) + 1); });
    return d;
  });
  flush();
  sel.set(1); flush();
  sel.set(2); flush();
  assert.deepEqual([...runs], [[1, 3], [2, 2], [3, 1]]);
  dispose();
});

test('SIGNAL_COERCED: a signal used as a value throws a TypeError in dev', () => {
  const count = signal(1, { debugName: 'count' });
  assert.throws(() => `${count}`, (e) => e instanceof TypeError && codeOf(e) === 'SIGNAL_COERCED');
});
