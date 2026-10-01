// Spec conformance: design.md B1-B5, ADR-10/11/12 against the runtime prototype.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  component, computed, createRoot, each, effect, flush, h, linkedSignal, match, mount, onMount, resource, show, signal,
  untracked,
} from '@jasno/core';
import { mountTest } from '@jasno/core/testing';
import { isIdle, nodeOf, type SignalNode } from '../../src/core.ts';
import { userFrame } from '../../src/diag.ts';
import { capture, codeOf, deferred, tick } from '../helpers.ts';

const subsOf = (s: unknown) => (nodeOf(s as Function) as SignalNode).subs;
const root = (fn: () => void): (() => void) => createRoot((d) => { fn(); return d; });

function withTarget<T>(fn: (target: HTMLElement) => T): T {
  const target = document.createElement('div');
  document.body.append(target);
  try { return fn(target); } finally { target.remove(); }
}

// ================================================================ B1 Reactive graph

test('B1.1 reads in untracked, onMount, cleanups and handlers inside an effect record nothing', (t) => {
  const tracked = signal(0), u = signal(0), m = signal(0), c = signal(0), hnd = signal(0);
  let runs = 0;
  mountTest(t, () => {
    const btn = h.button({ onclick: () => { hnd(); } }, 'b');
    effect(() => {
      runs++;
      tracked();
      untracked(() => u());
      onMount(() => { m(); });
      btn.click();
      return () => { c(); };
    });
    return btn;
  });
  assert.equal(runs, 1);
  u.set(1); m.set(1); c.set(1); hnd.set(1); flush();
  assert.equal(runs, 1);
  tracked.set(1); flush();
  assert.equal(runs, 2);
  u.set(2); m.set(2); c.set(2); hnd.set(2); flush();
  assert.equal(runs, 2);
});

test('B1.1 a computed read in setup, a handler or a cleanup links nothing to the enclosing owner', () => {
  const s = signal(1);
  const c = computed(() => s() * 2);
  const dispose = root(() => { onMount(() => { c(); }); onMount(() => () => { c(); }); });
  flush();
  dispose();
  assert.equal(subsOf(s), undefined);
});

test('B1.2 dependencies are dynamic: a run replaces the previous run\'s edges', (t) => {
  const which = signal(true), a = signal(1), b = signal(2);
  let runs = 0;
  const pick = computed(() => (which() ? a() : b()));
  mountTest(t, () => { effect(() => { runs++; pick(); }); return h.div(null); });
  assert.equal(runs, 1);
  b.set(3); flush();
  assert.equal(runs, 1, 'b was not read yet');
  which.set(false); flush();
  assert.equal(runs, 2);
  a.set(5); flush();
  assert.equal(runs, 2, 'a is no longer a dependency');
  assert.equal(subsOf(a), undefined, 'the edge to a was removed');
  b.set(4); flush();
  assert.equal(runs, 3);
});

test('B1.3 an observed computed is cached and recomputes only when read after a source changed', (t) => {
  const s = signal(1);
  let calls = 0;
  const c = computed(() => { calls++; return s() * 2; });
  mountTest(t, () => { effect(() => { c(); }); return h.div(null); });
  assert.equal(calls, 1);
  c(); c();
  assert.equal(calls, 1);
  s.set(2);
  assert.equal(calls, 1, 'a write does not recompute');
  assert.equal(c(), 4);
  assert.equal(calls, 2);
  flush();
  assert.equal(calls, 2, 'the effect reuses the value the read pulled');
});

test('B1.3 a computed whose last observer is disposed drops its links and recomputes per read', () => {
  const s = signal(1);
  let calls = 0;
  const inner = computed(() => s() + 1);
  const c = computed(() => { calls++; return inner() * 2; });
  const dispose = root(() => { effect(() => { c(); }); });
  flush();
  assert.ok(subsOf(s));
  dispose();
  assert.equal(subsOf(s), undefined, 'no links kept after the last observer left');
  c(); c();
  assert.equal(calls, 3);
  assert.equal(subsOf(s), undefined, 'an unobserved read leaves no links, also through a chain');
});

test('B1.3/m1 a computed does not belong to whoever read it first', () => {
  const s = signal(1);
  const c = computed(() => s() * 10);
  const disposeA = root(() => { effect(() => { c(); }); });
  flush();
  disposeA();
  const seen: number[] = [];
  const disposeB = root(() => { effect(() => { seen.push(c()); }); });
  flush();
  s.set(2); flush();
  assert.deepEqual(seen, [10, 20]);
  disposeB();
});

test('B1.4 a binding reading several changed sources runs once per round with consistent values', (t) => {
  const a = signal(1), b = signal(1);
  const sum = computed(() => a() + b());
  let runs = 0;
  const view = mountTest(t, () => h.p(null, () => { runs++; return `${a()}+${b()}=${sum()}`; }));
  a.set(2); b.set(3); flush();
  assert.equal(runs, 2);
  assert.equal(view.root.textContent, '2+3=5');
});

test('B1.4 a deep diamond: the effect runs once and never sees a torn state', (t) => {
  const a = signal(1);
  const b = computed(() => a() * 2);
  const c = computed(() => a() * 3);
  const d = computed(() => b() + c());
  const e = computed(() => d() - a());
  const seen: string[] = [];
  mountTest(t, () => { effect(() => { seen.push(`${a()}:${b()}:${c()}:${d()}:${e()}`); }); return h.div(null); });
  a.set(2); flush();
  a.set(3); a.set(4); flush();
  assert.deepEqual(seen, ['1:2:3:5:4', '2:4:6:10:8', '4:8:12:20:16']);
});

test('B1.5/B6.11 derivations run with no owner even when read from an owned effect', () => {
  const bad = computed(() => { onMount(() => {}); return 1; });
  const badRoot = computed(() => createRoot(() => 1));
  const errors: unknown[] = [];
  const dispose = root(() => {
    effect(() => {
      try { bad(); } catch (e) { errors.push(e); }
      try { badRoot(); } catch (e) { errors.push(e); }
    });
  });
  flush();
  dispose();
  assert.deepEqual(errors.map(codeOf), ['OWNED_IN_DERIVATION', 'OWNED_IN_DERIVATION']);
});

test('B1.5 a binding user function creating an effect throws OWNED_IN_DERIVATION at creation', () => {
  withTarget((target) => {
    assert.throws(() => mount(() => h.p(null, () => { effect(() => {}); return 'x'; }), target),
      (e) => codeOf(e) === 'OWNED_IN_DERIVATION');
  });
});

test('B1.5 an each key function is a derivation: creating an effect in it throws OWNED_IN_DERIVATION', () => {
  const cap = capture();
  let err: unknown;
  withTarget((target) => {
    try {
      const unmount = mount(() => h.ul(null, each(() => [1], {
        key: (x) => { effect(() => {}); return x; },
        render: (x) => h.li(null, () => String(x())),
      })), target);
      unmount();
    } catch (e) { err = e; }
  });
  cap.stop();
  assert.equal(err === undefined ? 'no error' : codeOf(err), 'OWNED_IN_DERIVATION', `got ${String(err)}; diagnostics ${cap.codes().join(',')}`);
});

// ================================================================ B2 Equality

test('B2.1 an equal set() is a no-op: nothing is notified or scheduled', (t) => {
  const s = signal(1);
  let runs = 0;
  mountTest(t, () => { effect(() => { s(); runs++; }); return h.div(null); });
  assert.ok(isIdle());
  s.set(1);
  assert.ok(isIdle(), 'no flush scheduled');
  flush();
  assert.equal(runs, 1);
});

test('B2.1 an equal set() under a custom equal keeps the old value', () => {
  const first = { id: 1, name: 'a' };
  const s = signal(first, { equal: (x, y) => x.id === y.id });
  s.set({ id: 1, name: 'b' });
  assert.equal(s(), first);
  assert.ok(isIdle());
});

test('B2.2 equal: () => false notifies on every set, for signals and computeds', (t) => {
  const s = signal(1, { equal: () => false });
  const src = signal(1);
  const c = computed(() => src() % 2, { equal: () => false });
  let sRuns = 0, cRuns = 0;
  mountTest(t, () => {
    effect(() => { s(); sRuns++; });
    effect(() => { c(); cRuns++; });
    return h.div(null);
  });
  s.set(1); flush();
  assert.equal(sRuns, 2);
  src.set(3); flush();
  assert.equal(cRuns, 2, 'the recomputed equal value still notifies');
});

test('B2.3 Object.is on computeds: NaN stays equal, -0 differs from +0', (t) => {
  const s = signal(0);
  const nan = computed(() => (s() >= 0 ? NaN : 1));
  const zero = computed(() => (s() > 1 ? -0 : 0));
  let nanRuns = 0, zeroRuns = 0;
  mountTest(t, () => {
    effect(() => { nan(); nanRuns++; });
    effect(() => { zero(); zeroRuns++; });
    return h.div(null);
  });
  s.set(1); flush();
  assert.equal(nanRuns, 1);
  assert.equal(zeroRuns, 1);
  s.set(2); flush();
  assert.equal(nanRuns, 1);
  assert.equal(zeroRuns, 2);
});

test('B2.3 a linkedSignal whose recomputed value is equal (custom equal) does not re-run consumers', (t) => {
  const id = signal(1);
  const l = linkedSignal({ source: id, computation: (v: number) => ({ parity: v % 2 }), equal: (a, b) => a.parity === b.parity });
  let runs = 0;
  mountTest(t, () => { effect(() => { l(); runs++; }); return h.div(null); });
  id.set(3); flush();
  assert.equal(runs, 1);
  id.set(4); flush();
  assert.equal(runs, 2);
});

test('B2.4 update(fn) reads the current value untracked (an effect does not subscribe to it)', (t) => {
  const a = signal(0);
  const counter = signal(0);
  const l = linkedSignal({ source: a, computation: () => 0 });
  let runs = 0;
  mountTest(t, () => {
    effect(() => { runs++; a(); counter.update((x) => x + 1); });
    return h.div(null);
  });
  assert.equal(counter(), 1);
  counter.set(10); flush();
  assert.equal(runs, 1, 'writing counter elsewhere does not re-run the effect');
  a.set(1); flush();
  assert.equal(runs, 2);
  assert.equal(counter(), 11);
  // linkedSignal.update is untracked too
  let lRuns = 0;
  const dispose = root(() => { effect(() => { lRuns++; a(); untracked(() => l.update((x) => x + 1)); }); });
  flush();
  l.set(100); flush();
  assert.equal(lRuns, 1);
  dispose();
});

test('B2.5 a throwing equal makes the write throw and leaves the value unchanged', (t) => {
  const s = signal(1, { equal: () => { throw new Error('eq'); } });
  const l = linkedSignal({ source: () => 1, computation: () => 5, equal: (a, b) => { if (b === 99) throw new Error('leq'); return a === b; } });
  let runs = 0;
  mountTest(t, () => { effect(() => { s(); l(); runs++; }); return h.div(null); });
  assert.throws(() => s.set(2), /eq/);
  assert.equal(s(), 1);
  assert.throws(() => l.set(99), /leq/);
  assert.equal(l(), 5);
  assert.ok(isIdle(), 'nothing scheduled');
  flush();
  assert.equal(runs, 1);
});

test('B2.5 equal runs untracked: a signal read inside equal does not subscribe the computed or effect', (t) => {
  const other = signal(0);
  const src = signal(1);
  const c = computed(() => src(), { equal: (a, b) => { other(); return a === b; } });
  const scratch = signal(0, { equal: (a, b) => { other(); return a === b; } });
  let cRuns = 0, eRuns = 0;
  mountTest(t, () => {
    effect(() => { c(); cRuns++; });
    effect(() => { eRuns++; scratch.set(src() + 1); });
    return h.div(null);
  });
  src.set(2); flush();
  assert.equal(cRuns, 2);
  assert.equal(eRuns, 2);
  other.set(1); flush();
  assert.equal(cRuns, 2);
  assert.equal(eRuns, 2);
});

test('B2.7 linkedSignal compares source values with Object.is (NaN keeps, -0 resets, same value keeps local)', () => {
  const src = signal<number>(NaN);
  let calls = 0;
  const l = linkedSignal({ source: src, computation: (v: number) => { calls++; return `c${v}`; } });
  assert.equal(l(), 'cNaN');
  src.set(NaN);
  l.set('local');
  src.set(NaN);
  assert.equal(l(), 'local');
  src.set(0);
  assert.equal(l(), 'c0');
  src.set(-0);
  assert.equal(l(), 'c0', 'recomputed for -0');
  assert.equal(calls, 3);
  const user = signal({ id: 1, name: 'a' });
  const draft = linkedSignal({ source: () => user().id, computation: () => '' });
  const seen: string[] = [];
  const dispose = root(() => { effect(() => { seen.push(draft()); }); });
  flush();
  draft.set('typed');
  user.set({ id: 1, name: 'renamed' }); flush();
  assert.equal(draft(), 'typed', 'same source value keeps the local value');
  user.set({ id: 2, name: 'b' }); flush();
  assert.equal(draft(), '');
  assert.deepEqual(seen, ['', 'typed', '']);
  dispose();
});

// ================================================================ B3 Read-your-writes

test('B3.1 an observed computed chain is consistent right after a write, also inside onMount', (t) => {
  const s = signal(1);
  const a = computed(() => s() + 1);
  const b = computed(() => a() * 10);
  const l = linkedSignal({ source: b, computation: (v: number) => v + 1 });
  const lc = computed(() => l() * 2);
  const seen: number[] = [];
  mountTest(t, () => {
    const p = h.p(null, () => `${b()} ${lc()}`);
    onMount(() => { s.set(5); seen.push(b(), l(), lc()); l.set(7); seen.push(lc()); });
    return p;
  });
  assert.deepEqual(seen, [60, 61, 122, 14]);
  s.set(2);
  assert.equal(b(), 30);
  assert.equal(lc(), 62);
});

test('B3.1 inside an effect, a computed read after the effect\'s own write sees the write', () => {
  const cap = capture();
  const s = signal(1);
  const c = computed(() => s() * 2);
  const seen: number[] = [];
  const dispose = root(() => { effect(() => { const before = c(); if (before === 2) { s.set(3); seen.push(before, c()); } }); });
  flush();
  cap.stop();
  dispose();
  assert.deepEqual(seen, [2, 6]);
});

test('B3.2 writes never run consumers synchronously, not even during phase (b) or onMount', (t) => {
  const s = signal(0);
  const seen: string[] = [];
  let p!: HTMLElement;
  mountTest(t, () => {
    p = h.p(null, () => `s=${s()}`);
    onMount(() => { s.set(1); seen.push(p.textContent!); });
    return p;
  });
  assert.deepEqual(seen, ['s=0']);
  assert.equal(p.textContent, 's=1', 'applied in the same flush (next round)');
  const b = h.button({ onclick: () => { s.set(2); seen.push(p.textContent!); } }, 'x');
  b.click();
  assert.equal(seen[1], 's=1');
  flush();
  assert.equal(p.textContent, 's=2');
});

test('B3.3 resource status follows params synchronously', (t) => {
  const id = signal<number | undefined>(undefined);
  const d = deferred<string>();
  let r!: { status: () => string };
  mountTest(t, () => {
    r = resource({ params: id, loader: () => d.promise }) as never;
    return h.p(null, () => r.status());
  });
  assert.equal(r.status(), 'idle');
  id.set(1);
  assert.equal(r.status(), 'loading');
  id.set(undefined);
  assert.equal(r.status(), 'idle');
});

test('B3.4 each item/index and show value lag until the next flush', (t) => {
  const list = signal([{ id: 1, t: 'a' }, { id: 2, t: 'b' }]);
  const when = signal<string | null>('x');
  const items = new Map<number, () => { t: string }>();
  const indexes = new Map<number, () => number>();
  let value!: () => string;
  mountTest(t, () => h.div(null,
    h.ul(null, each(list, { key: (x) => x.id, render: (item, index, k) => { items.set(k as number, item); indexes.set(k as number, index); return h.li(null, () => item().t); } })),
    show(when, (v) => { value = v as () => string; return h.b(null, v); }),
  ));
  list.set([{ id: 2, t: 'B' }, { id: 1, t: 'A' }]);
  when.set('y');
  assert.equal(items.get(1)!().t, 'a');
  assert.equal(indexes.get(1)!(), 0);
  assert.equal(value(), 'x');
  flush();
  assert.equal(items.get(1)!().t, 'A');
  assert.equal(indexes.get(1)!(), 1);
  assert.equal(value(), 'y');
});

test('B3.5 linkedSignal set()/update() settle a pending source change first', () => {
  const src = signal('a');
  const computations: string[] = [];
  const l = linkedSignal({ source: src, computation: (v: string, prev) => { computations.push(`${v}<${prev?.source}:${prev?.value}`); return v + '!'; } });
  assert.equal(l(), 'a!');
  src.set('b');
  l.update((x) => x + '?');
  assert.equal(l(), 'b!?', 'update received the settled value');
  src.set('c');
  l.set('mine');
  assert.equal(l(), 'mine');
  assert.equal(l(), 'mine');
  assert.deepEqual(computations, ['a<undefined:undefined', 'b<a:a!', 'c<b:b!?']);
});

test('B3.5 observed linkedSignal: a local write after a source change survives the flush', (t) => {
  const src = signal(1);
  const l = linkedSignal({ source: src, computation: (v: number) => v * 100 });
  const seen: number[] = [];
  const view = mountTest(t, () => {
    effect(() => { seen.push(l()); });
    return h.p(null, () => String(l()));
  });
  src.set(2);
  l.set(7);
  flush();
  assert.equal(view.root.textContent, '7');
  assert.deepEqual(seen, [100, 7]);
  src.set(3); flush();
  assert.deepEqual(seen, [100, 7, 300]);
});

// ================================================================ B4 Scheduling and flush order

test('B4.1 writes schedule at most one microtask; writes that dirty nothing schedule none', (t) => {
  const s = signal(0), lonely = signal(0);
  const c = computed(() => lonely() * 2);
  mountTest(t, () => { effect(() => { s(); }); return h.div(null); });
  c();
  const orig = globalThis.queueMicrotask;
  let calls = 0;
  globalThis.queueMicrotask = (fn) => { calls++; orig(fn); };
  try {
    lonely.set(1);
    s.set(0);
    assert.equal(calls, 0);
    s.set(1); s.set(2); s.set(3);
    assert.equal(calls, 1);
  } finally { globalThis.queueMicrotask = orig; }
  flush();
});

test('B4.1 after flush() ran the pending work, the queued microtask does nothing', async (t) => {
  const s = signal(0);
  let runs = 0;
  mountTest(t, () => { effect(() => { s(); runs++; }); return h.div(null); });
  s.set(1);
  flush();
  assert.equal(runs, 2);
  await Promise.resolve();
  await tick();
  assert.equal(runs, 2);
  flush(); // nothing pending: no-op
  assert.equal(runs, 2);
});

test('B4.2 flush() in onMount drains phase (a) now; phase (b) work stays queued for the running flush', (t) => {
  const s = signal(0);
  const log: string[] = [];
  mountTest(t, () => {
    effect(() => { log.push(`e1 ${s()}`); });
    const p = h.p(null, () => `s=${s()}`);
    onMount(() => { s.set(1); flush(); log.push(`mount sees ${p.textContent}`); });
    effect(() => { log.push(`e2 ${s()}`); });
    return p;
  });
  assert.deepEqual(log, ['e1 0', 'mount sees s=1', 'e2 1', 'e1 1']);
});

test('B4.2 flush() in an effect drains bindings synchronously (the effect write is reported)', () => {
  const cap = capture();
  const s = signal(0, { debugName: 's' });
  const go = signal(false);
  const log: string[] = [];
  withTarget((target) => {
    const unmount = mount(() => {
      const p = h.p(null, () => `s=${s()}`);
      effect(() => { if (!go()) return; s.set(1); flush(); log.push(p.textContent!); }, { debugName: 'writer' });
      effect(() => { log.push(`other ${s()}`); });
      return p;
    }, target);
    flush();
    go.set(true); flush();
    unmount();
  });
  cap.stop();
  assert.deepEqual(log, ['other 0', 's=1', 'other 1']);
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
});

test('B4.2 flush() in a handler dispatched synchronously during phase (b) drains phase (a)', (t) => {
  const s = signal(0), go = signal(false);
  const seen: string[] = [];
  mountTest(t, () => {
    const p = h.p(null, () => `s=${s()}`);
    const btn = h.button({ onclick: () => { s.set(5); flush(); seen.push(p.textContent!); } }, 'b');
    effect(() => { if (go()) btn.click(); });
    return h.div(null, p, btn);
  });
  go.set(true); flush();
  assert.deepEqual(seen, ['s=5']);
});

test('B4.2 flush() in setup throws FLUSH_REENTRANT: component body, mount view, untracked in setup', () => {
  const Comp = component(function Comp(): Node { flush(); return h.div(null); });
  withTarget((target) => {
    assert.throws(() => mount(() => Comp(), target), (e) => codeOf(e) === 'FLUSH_REENTRANT');
    assert.throws(() => mount(() => { flush(); return h.div(null); }, target), (e) => codeOf(e) === 'FLUSH_REENTRANT');
    assert.throws(() => mount(() => { untracked(() => flush()); return h.div(null); }, target), (e) => codeOf(e) === 'FLUSH_REENTRANT');
  });
});

test('B4.2 flush() in a builder during a flush throws FLUSH_REENTRANT (routed)', () => {
  const cap = capture();
  const on = signal(false);
  withTarget((target) => {
    const unmount = mount(() => h.div(null, show(on, () => { flush(); return h.span(null, 'x'); })), target);
    on.set(true);
    flush();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.errors.map(codeOf), ['FLUSH_REENTRANT']);
});

test('B4.2 flush() in a binding function or linkedSignal computation throws FLUSH_REENTRANT', () => {
  const cap = capture();
  withTarget((target) => {
    assert.throws(() => mount(() => h.p(null, () => { flush(); return 'x'; }), target), (e) => codeOf(e) === 'FLUSH_REENTRANT');
    const n = signal(0);
    const unmount = mount(() => h.p(null, () => { if (n() > 0) flush(); return String(n()); }), target);
    n.set(1); flush();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.errors.map(codeOf), ['FLUSH_REENTRANT']);
  const l = linkedSignal({ source: () => 1, computation: () => { flush(); return 1; } });
  assert.throws(() => l(), (e) => codeOf(e) === 'FLUSH_REENTRANT');
});

test('B4.2 flush() in an each key function (a derivation) throws FLUSH_REENTRANT', () => {
  let err: unknown;
  withTarget((target) => {
    try {
      const unmount = mount(() => h.ul(null, each(() => [1], { key: (x) => { flush(); return x; }, render: () => h.li(null, 'r') })), target);
      unmount();
    } catch (e) { err = e; }
  });
  assert.equal(err === undefined ? 'no error' : codeOf(err), 'FLUSH_REENTRANT', `got ${String(err)}`);
});

test('B4.3 phase (a): a parent region disposing a branch drops the branch binding before it runs', (t) => {
  const on = signal(true), x = signal(0);
  let inner = 0;
  const view = mountTest(t, () => h.div(null, show(on, () => h.p(null, () => { inner++; return String(x()); }))));
  on.set(false); x.set(1); flush();
  assert.equal(inner, 1);
  assert.equal(view.root.textContent, '');
});

test('B4.3 phase (a) runs bindings in creation order', (t) => {
  const s = signal(0);
  const log: string[] = [];
  mountTest(t, () => {
    const second = h.i(null, () => { log.push(`b2 ${s()}`); return ''; });
    const first = h.b(null, () => { log.push(`b3 ${s()}`); return ''; });
    return h.div(null, first, second, h.u(null, () => { log.push(`b4 ${s()}`); return ''; }));
  });
  log.length = 0;
  s.set(1); flush();
  assert.deepEqual(log, ['b2 1', 'b3 1', 'b4 1']);
});

test('B4.3 a lower-sequence binding dirtied again during phase (a) runs again before phase (b)', () => {
  const cap = capture();
  const x = signal(0, { debugName: 'x' });
  const k = signal(0);
  const seen: string[] = [];
  withTarget((target) => {
    const unmount = mount(() => {
      const p = h.p(null, () => `x=${x()}`);
      const region = match(k, (key) => { if ((key as number) > 0) x.set((key as number) * 10); return h.span(null, String(key)); });
      effect(() => { k(); seen.push(p.textContent!); });
      return h.div(null, p, region);
    }, target);
    flush();
    k.set(1); flush();
    unmount();
  });
  cap.stop();
  assert.deepEqual(seen, ['x=0', 'x=10']);
  assert.deepEqual(cap.codes(), ['WRITE_IN_SETUP']);
});

test('B4.3 phase (b) runs first runs and dirty effects in creation order, new branches included', (t) => {
  const s = signal(0);
  const log: string[] = [];
  const Child = component(function Child(): Node { onMount(() => { log.push('M1'); }); return h.span(null); });
  mountTest(t, () => {
    effect(() => { log.push(`E1 ${s()}`); });
    const c = Child();
    effect(() => { log.push(`E2 ${s()}`); });
    return h.div(null, c, show(() => s() > 0, () => {
      onMount(() => { log.push('M2'); });
      effect(() => { log.push(`E3 ${s()}`); });
      return h.span(null);
    }));
  });
  s.set(1); flush();
  assert.deepEqual(log, ['E1 0', 'M1', 'E2 0', 'E1 1', 'E2 1', 'M2', 'E3 1']);
});

test('B4.4 computations are pulled, never scheduled', () => {
  const s = signal(0);
  let calls = 0;
  const c = computed(() => { calls++; return s(); });
  let stop = () => {};
  const dispose = root(() => { stop = effect(() => { c(); }); });
  flush();
  assert.equal(calls, 1);
  s.set(1);
  stop();
  flush();
  assert.equal(calls, 1);
  dispose();
});

test('B4.6 a flush reaching round 101 throws EFFECT_LOOP naming the looping effect', () => {
  const n = signal(0);
  let stop = () => {};
  const dispose = root(() => { stop = effect(() => { n.set(n() + 1); }, { debugName: 'spinner' }); });
  const cap = capture();
  assert.throws(() => flush(), (e) => codeOf(e) === 'EFFECT_LOOP' && /spinner/.test((e as Error).message));
  cap.stop();
  stop(); dispose();
});

test('B4.6 an EFFECT_LOOP in a microtask flush is reported', async () => {
  const cap = capture();
  const on = signal(true);
  const n = signal(0);
  const dispose = root(() => { effect(() => { const v = n(); if (on()) n.set(v + 1); }, { debugName: 'micro-spinner' }); });
  await tick();
  on.set(false);
  await tick();
  cap.stop();
  dispose();
  assert.ok(cap.errors.some((e) => codeOf(e) === 'EFFECT_LOOP'), cap.errors.map(String).join('\n'));
});

test('B4.6 a binding run more than 100 times in one flush throws EFFECT_LOOP; it is re-armed', () => {
  const cap = capture();
  const on = signal(false);
  const x = signal(0, { debugName: 'x' });
  let err: unknown;
  withTarget((target) => {
    const unmount = mount(() => h.div(null,
      h.p(null, () => `x=${x()}`),
      match(x, (key) => { if (untracked(on)) x.set((key as number) + 1); return h.span(null, String(key)); })), target);
    on.set(true); x.set(1);
    try { flush(); } catch (e) { err = e; }
    on.set(false);
    x.set(500);
    flush();
    assert.equal(target.querySelector('p')!.textContent, 'x=500');
    assert.equal(target.querySelector('span')!.textContent, '500');
    unmount();
  });
  cap.stop();
  assert.equal(codeOf(err), 'EFFECT_LOOP');
  assert.match((err as Error).message, /binding text|match/);
});

test('B4.6 the EFFECT_LOOP message lists the capped binding among bindings whose DOM may be stale', () => {
  const cap = capture();
  const on = signal(false);
  const x = signal(0, { debugName: 'x' });
  let err: unknown;
  withTarget((target) => {
    const unmount = mount(() => h.div(null,
      h.p(null, () => `x=${x()}`),
      match(x, (key) => { if (untracked(on)) x.set((key as number) + 1); return h.span(null, String(key)); })), target);
    on.set(true); x.set(1);
    try { flush(); } catch (e) { err = e; }
    on.set(false);
    // <p> did not apply the last value of x: its DOM is stale
    assert.notEqual(target.querySelector('p')!.textContent, `x=${x()}`);
    unmount();
  });
  cap.stop();
  const stale = /DOM may be stale in: (.*)\./.exec((err as Error).message)?.[1] ?? '';
  assert.match(stale, /binding text/, `message: ${(err as Error).message}`);
});

test('B4.6 a consumer dropped at the cap is re-armed even when it reads through a computed', () => {
  const on = signal(true);
  const n = signal(0);
  const state = computed(() => ({ v: n(), on: on() }));
  let runs = 0;
  let text!: HTMLElement;
  const cap = capture();
  const dispose = root(() => {
    effect(() => { runs++; const s = state(); if (s.on) n.set(s.v + 1); }, { debugName: 'via-computed' });
  });
  withTarget((target) => {
    const unmount = mount(() => (text = h.p(null, () => `double=${state().v * 2}`)), target);
    assert.throws(() => flush(), (e) => codeOf(e) === 'EFFECT_LOOP');
    const before = runs;
    on.set(false);
    flush();
    const effectRan = runs === before + 1;
    n.set(7);
    flush();
    const bindingText = text.textContent;
    unmount();
    cap.stop();
    dispose();
    assert.deepEqual({ effectRan, bindingText }, { effectRan: true, bindingText: 'double=14' });
  });
});

test('B4.6 EFFECT_LOOP names the looping consumers with their locations in dev', () => {
  const n = signal(0);
  let stop = () => {};
  let where: string | undefined;
  const dispose = root(() => {
    const here = new Error(); stop = effect(() => { n.set(n() + 1); });
    where = userFrame(here.stack);
  });
  const cap = capture();
  let err: unknown;
  try {
    flush();
  } catch (e) { err = e; }
  cap.stop();
  stop(); dispose();
  const line = where!.split(':').slice(0, 2).join(':'); // file:line of the effect() call
  assert.equal(codeOf(err), 'EFFECT_LOOP');
  assert.ok((err as Error).message.includes(line), `expected ${line} in: ${(err as Error).message}`);
});

test('B4.7 an effect created outside a flush first runs in the next (microtask) flush; bindings run at creation', async () => {
  const s = signal('a');
  const log: string[] = [];
  let p!: HTMLElement;
  const dispose = root(() => {
    effect(() => { log.push(`effect ${s()}`); });
    onMount(() => { log.push('mount'); });
    p = h.p(null, () => `text ${s()}`);
  });
  assert.equal(p.textContent, 'text a', 'binding evaluated synchronously');
  assert.deepEqual(log, []);
  await Promise.resolve();
  assert.deepEqual(log, ['effect a', 'mount']);
  dispose();
});

test('B4.7 effects and onMount created during a flush first run in that same flush', (t) => {
  const on = signal(false);
  const log: string[] = [];
  mountTest(t, () => {
    effect(() => {
      if (!on()) return;
      effect(() => { log.push(`nested ${on()}`); });
    });
    return h.div(null, show(on, () => { onMount(() => { log.push('branch mount'); }); return h.span(null); }));
  });
  on.set(true); flush();
  assert.deepEqual(log, ['branch mount', 'nested true']);
  assert.ok(isIdle());
});

test('B4.8 effects see the DOM updated by bindings and branches of their round', (t) => {
  const on = signal(false), label = signal('a');
  const seen: string[] = [];
  mountTest(t, () => {
    const div = h.div(null, () => label(), show(on, () => h.span(null, '+branch')));
    effect(() => { on(); label(); seen.push(div.textContent!); });
    return div;
  });
  on.set(true); label.set('b'); flush();
  assert.deepEqual(seen, ['a', 'b+branch']);
});

test('B4.9 user error objects thrown by consumers are never modified', () => {
  const cap = capture();
  const s = signal(0);
  const err = new Error('mine');
  const frozen = Object.freeze({ reason: 'frozen' });
  const keys = Reflect.ownKeys(err);
  const dispose = root(() => {
    effect(() => { if (s() === 1) throw err; });
    effect(() => { if (s() === 1) throw frozen; });
  });
  flush();
  s.set(1); flush();
  cap.stop();
  dispose();
  assert.deepEqual(cap.errors, [err, frozen]);
  assert.deepEqual(Reflect.ownKeys(err), keys);
  assert.equal((err as { cause?: unknown }).cause, undefined);
});

test('B4.10 more than 1,000 microtask flushes without a macrotask report EFFECT_LOOP', async () => {
  const cap = capture();
  const n = signal(0);
  let runs = 0;
  let stop = () => {};
  const dispose = root(() => {
    stop = effect(() => { runs++; const v = n(); if (v < 100_000) queueMicrotask(() => n.set(v + 1)); }, { debugName: 'async-loop' });
  });
  await tick();
  cap.stop();
  stop(); dispose();
  flush();
  assert.ok(cap.errors.some((e) => codeOf(e) === 'EFFECT_LOOP'), `errors: ${cap.errors.map(String).join('\n')}`);
  assert.ok(runs > 900 && runs < 1100, `runs=${runs}`);
});

test('B4.10 after the async-loop guard trips, the next source change runs the effect again', async () => {
  const cap = capture();
  const n = signal(0);
  let runs = 0;
  let stop = () => {};
  const dispose = root(() => {
    stop = effect(() => { runs++; const v = n(); if (v < 1_000_000 && v >= 0) queueMicrotask(() => n.set(v + 1)); }, { debugName: 'async-loop-2' });
  });
  await tick();
  const tripped = cap.errors.some((e) => codeOf(e) === 'EFFECT_LOOP');
  const before = runs;
  n.set(-5); // converges: the effect no longer writes
  await tick();
  const after = runs;
  cap.stop();
  stop(); dispose();
  flush();
  assert.ok(tripped);
  assert.equal(after, before + 1, 'the effect ran for the new source value');
});

// ================================================================ B5 Writes in derivations, effects and setup

test('B5.1 a write in a binding function throws WRITE_IN_DERIVATION at creation and is routed later', () => {
  const cap = capture();
  const target = signal(0, { debugName: 'target' });
  const n = signal(0);
  withTarget((el) => {
    assert.throws(() => mount(() => h.p(null, () => { target.set(1); return 'x'; }), el),
      (e) => codeOf(e) === 'WRITE_IN_DERIVATION' && /target/.test((e as Error).message));
    const unmount = mount(() => h.p(null, () => { if (n() > 0) untracked(() => target.set(2)); return String(n()); }), el);
    n.set(1); flush();
    unmount();
  });
  cap.stop();
  assert.equal(target(), 0);
  assert.deepEqual(cap.errors.map(codeOf), ['WRITE_IN_DERIVATION']);
});

test('B5.1 a write in a linkedSignal computation or a show/match source throws WRITE_IN_DERIVATION', () => {
  const s = signal(0);
  const l = linkedSignal({ source: () => 1, computation: () => { s.set(1); return 1; } });
  assert.throws(() => l(), (e) => codeOf(e) === 'WRITE_IN_DERIVATION');
  const c = computed(() => { l.set(3); return 1; });
  assert.throws(() => c(), (e) => codeOf(e) === 'WRITE_IN_DERIVATION');
  withTarget((el) => {
    assert.throws(() => mount(() => h.div(null, show(() => { s.set(2); return true; }, () => 'x')), el),
      (e) => codeOf(e) === 'WRITE_IN_DERIVATION');
  });
  assert.equal(s(), 0);
});

test('B5.1 a write in an each key function (a derivation) throws WRITE_IN_DERIVATION', () => {
  const cap = capture();
  const s = signal(0, { debugName: 'side' });
  let err: unknown;
  withTarget((el) => {
    try {
      const unmount = mount(() => h.ul(null, each(() => [1, 2], {
        key: (x) => { s.set(x); return x; },
        render: (x) => h.li(null, () => String(x())),
      })), el);
      unmount();
    } catch (e) { err = e; }
  });
  cap.stop();
  assert.equal(err === undefined ? 'no error' : codeOf(err), 'WRITE_IN_DERIVATION', `got ${String(err)}; side=${s()}; diagnostics ${cap.codes().join(',')}`);
});

test('B5.2 writes in onMount, handlers, timers, promise callbacks and cleanups are silent', async (t) => {
  const s = signal(0);
  const toggle = signal(true);
  const view = mountTest(t, () => {
    const p = h.p(null, () => String(s()));
    onMount(() => {
      s.set(1);
      const timer = setTimeout(() => s.set(3), 1);
      Promise.resolve().then(() => s.set(4));
      return () => { clearTimeout(timer); s.set(0); };
    });
    effect(() => { toggle(); return () => s.set(s() + 100); });
    return h.div(null, p, h.button({ onclick: () => s.set(2) }, 'b'));
  });
  view.root.querySelector('button')!.click();
  await new Promise((r) => setTimeout(r, 10));
  toggle.set(false); flush();
  assert.ok(s() > 100);
});

test('B5.3 an effect writing a signal nobody observes and it did not read is silent', () => {
  const cap = capture();
  const a = signal(1), scratch = signal(0);
  const dispose = root(() => { effect(() => { scratch.set(a() + 1); }, { debugName: 'silent' }); });
  flush();
  a.set(2); flush();
  cap.stop();
  dispose();
  assert.deepEqual(cap.codes(), []);
  assert.equal(scratch(), 3);
});

test('B5.3 an effect writing an observed signal it did not read reports once and is not re-queued', () => {
  const cap = capture();
  const a = signal(1), b = signal(0, { debugName: 'b' });
  let writer = 0;
  const seen: number[] = [];
  const dispose = root(() => {
    effect(() => { seen.push(b()); });
    effect(() => { writer++; b.set(a() * 2); }, { debugName: 'copy' });
  });
  flush();
  a.set(2); flush();
  cap.stop();
  dispose();
  assert.equal(writer, 2);
  assert.deepEqual(seen, [0, 2, 4]);
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
  assert.match(cap.diags[0]!.message, /"copy".*"b"/);
});

test('B5.3 a write inside untracked() in an effect is still reported', () => {
  const cap = capture();
  const a = signal(1), b = signal(0);
  const dispose = root(() => {
    effect(() => { b(); });
    effect(() => { const v = a(); untracked(() => b.set(v)); });
  });
  flush();
  cap.stop();
  dispose();
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
});

test('B5.3 a callback invoked synchronously during the run is tracked and its writes reported', () => {
  const cap = capture();
  const x = signal(1), y = signal(0, { debugName: 'y' });
  const subscribe = (cb: () => void) => { cb(); return () => {}; };
  let runs = 0;
  const dispose = root(() => {
    effect(() => { y(); });
    effect(() => { runs++; return subscribe(() => y.set(x() * 10)); }, { debugName: 'subscriber' });
  });
  flush();
  x.set(2); flush();
  cap.stop();
  dispose();
  assert.equal(runs, 2, 'the read inside the callback subscribed the effect');
  assert.equal(y(), 20);
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
});

test('B5.3 an effect that read the signal is queued again in the same flush and converges', () => {
  const cap = capture();
  const n = signal(10);
  const log: number[] = [];
  const dispose = root(() => { effect(() => { const v = n(); log.push(v); if (v > 7) n.set(v - 1); }); });
  flush();
  assert.ok(isIdle());
  cap.stop();
  dispose();
  assert.deepEqual(log, [10, 9, 8, 7]);
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
});

test('B5.3 EFFECT_WRITES_STATE is reported once per (effect, signal), whatever the call site', () => {
  const cap = capture();
  const a = signal(1), b = signal(0);
  const dispose = root(() => {
    effect(() => { b(); });
    effect(() => {
      const v = a();
      if (v % 2) b.set(v);
      else b.set(-v);
    }, { debugName: 'two-sites' });
  });
  flush();
  a.set(2); flush();
  cap.stop();
  dispose();
  assert.equal(cap.codes().filter((c) => c === 'EFFECT_WRITES_STATE').length, 1, cap.diags.map((d) => d.message).join('\n'));
});

test('B5.4 setup may write signals (and linkedSignals) it created', (t) => {
  const view = mountTest(t, () => {
    const s = signal(0);
    s.set(1);
    const l = linkedSignal({ source: () => 1, computation: () => 0 });
    l.set(5);
    const Comp = component(function Comp(): Node { const own = signal('a'); own.set('b'); return h.i(null, own); });
    return h.p(null, s, ' ', l, ' ', Comp());
  });
  assert.equal(view.root.textContent, '1 5 b');
});

test('B5.4 setup writing a signal it did not create reports WRITE_IN_SETUP and applies the write', () => {
  const cap = capture();
  const outside = signal(0, { debugName: 'outside' });
  const on = signal(false);
  let fromParent = '';
  withTarget((el) => {
    const Child = component(function Child(p: { s: { set: (v: string) => void } }): Node { p.s.set('child'); return h.span(null); });
    const Parent = component(function Parent(): Node {
      const mine = signal('p', { debugName: 'mine' });
      const node = h.div(null, Child({ s: mine }), show(on, () => { mine.set('branch'); return h.b(null); }));
      fromParent = untracked(mine);
      return node;
    });
    const unmount = mount(() => { outside.set(1); return Parent(); }, el);
    on.set(true); flush();
    unmount();
  });
  cap.stop();
  assert.equal(outside(), 1);
  assert.equal(fromParent, 'child');
  assert.deepEqual(cap.codes(), ['WRITE_IN_SETUP', 'WRITE_IN_SETUP', 'WRITE_IN_SETUP']);
});

test('B5.4 a foreign write inside untracked() in setup is still WRITE_IN_SETUP', () => {
  const cap = capture();
  const outside = signal(0, { debugName: 'outside2' });
  withTarget((el) => {
    const unmount = mount(() => { untracked(() => outside.set(1)); return h.div(null); }, el);
    unmount();
  });
  cap.stop();
  assert.equal(outside(), 1);
  assert.deepEqual(cap.codes(), ['WRITE_IN_SETUP']);
});

test('B5.5 a write to a signal whose creating owner is disposed is applied and silent', (t) => {
  let s!: { (): number; set: (v: number) => void };
  const dispose = createRoot((d) => { s = signal(1) as never; return d; });
  dispose();
  const view = mountTest(t, () => {
    onMount(() => { s.set(2); });
    return h.p(null, () => String(s()));
  });
  assert.equal(view.root.textContent, '2');
  s.set(3);
  assert.equal(s(), 3);
});

test('B5.6 linkedSignal: first read passes undefined; previous carries the old source and current value', () => {
  const src = signal(1);
  const calls: unknown[] = [];
  const l = linkedSignal({ source: src, computation: (v: number, prev: { source: number; value: string } | undefined) => { calls.push(prev); return `v${v}`; } });
  assert.equal(calls.length, 0, 'lazy');
  assert.equal(l(), 'v1');
  l.set('edited');
  src.set(2);
  assert.equal(l(), 'v2');
  assert.deepEqual(calls, [undefined, { source: 1, value: 'edited' }]);
});

test('B5.6 linkedSignal computation runs untracked: its reads never reset the value', (t) => {
  const src = signal(1), other = signal('x');
  let calls = 0;
  const l = linkedSignal({ source: src, computation: (v: number) => { calls++; return `${v}${other()}`; } });
  const view = mountTest(t, () => h.p(null, l));
  other.set('y'); flush();
  assert.equal(view.root.textContent, '1x');
  assert.equal(calls, 1);
  src.set(2); flush();
  assert.equal(view.root.textContent, '2y');
});

test('B5.6 linkedSignal local value persists across unrelated re-reads until the source value changes', (t) => {
  const src = signal('a');
  const l = linkedSignal({ source: src, computation: (v: string) => v.toUpperCase() });
  const view = mountTest(t, () => h.p(null, l));
  l.set('local');
  flush();
  src.set('a'); flush();
  assert.equal(view.root.textContent, 'local');
  src.set('b'); flush();
  assert.equal(view.root.textContent, 'B');
});

// ================================================================ ADR-11 pinned behaviours, edge variants

test('ADR-11 pinned 6 variant: an effect stopped by another effect in the same batch runs its cleanup once and never again', () => {
  const s = signal(0);
  const log: string[] = [];
  let stopB = () => {};
  const dispose = root(() => {
    effect(() => { if (s() === 1) stopB(); });
    stopB = effect(() => { const v = s(); log.push(`run ${v}`); return () => log.push(`cleanup ${v}`); });
  });
  flush();
  s.set(1); flush();
  s.set(2); flush();
  dispose();
  assert.deepEqual(log, ['run 0', 'cleanup 0']);
});

test('ADR-12 a self-writing effect that never converges hits the cap instead of hanging, then recovers', () => {
  const cap = capture();
  const on = signal(true);
  const n = signal(0);
  let runs = 0;
  const dispose = root(() => { effect(() => { runs++; const v = n(); if (on()) n.set(v + 1); }); });
  assert.throws(() => flush(), (e) => codeOf(e) === 'EFFECT_LOOP');
  assert.ok(runs <= 101, `runs=${runs}`);
  on.set(false); flush();
  assert.ok(isIdle());
  cap.stop();
  dispose();
});

// ================================================================ extra edge cases

test('B4.6 the per-consumer cap counts runs per flush: 60 runs in each of two flushes is fine', () => {
  const cap = capture();
  const n = signal(0);
  const limit = signal(60);
  const dispose = root(() => { effect(() => { const v = n(); if (v < limit()) n.set(v + 1); }); });
  flush();
  assert.equal(n(), 60);
  limit.set(120);
  flush();
  assert.equal(n(), 120);
  cap.stop();
  dispose();
  assert.deepEqual([...new Set(cap.codes())], ['EFFECT_WRITES_STATE']);
  assert.deepEqual(cap.errors, []);
});

test('B4.6 a binding reading the looping signal directly is re-armed after the round cap', () => {
  const cap = capture();
  const on = signal(true);
  const n = signal(0);
  const dispose = root(() => { effect(() => { const v = n(); if (on()) n.set(v + 1); }); });
  withTarget((el) => {
    const unmount = mount(() => h.p(null, () => `n=${n()}`), el);
    assert.throws(() => flush(), (e) => codeOf(e) === 'EFFECT_LOOP');
    on.set(false); flush();
    n.set(-1); flush();
    assert.equal(el.textContent, 'n=-1');
    unmount();
  });
  cap.stop();
  dispose();
});

test('B4.3 a show value set by its binding updates branch bindings in the same phase', (t) => {
  const user = signal<{ name: string } | null>({ name: 'a' });
  const seen: string[] = [];
  mountTest(t, () => {
    const div = h.div(null, show(user, (u) => h.b(null, () => u().name)));
    effect(() => { user(); seen.push(div.textContent!); });
    return div;
  });
  user.set({ name: 'b' }); flush();
  assert.deepEqual(seen, ['a', 'b']);
});

test('B4.1 writes made during a flush schedule no extra microtask', (t) => {
  const s = signal(0);
  let p!: HTMLElement;
  mountTest(t, () => (p = h.p(null, () => String(s()))));
  const orig = globalThis.queueMicrotask;
  let calls = 0;
  const dispose = root(() => { onMount(() => { s.set(1); }); });
  globalThis.queueMicrotask = (fn) => { calls++; orig(fn); };
  try {
    flush();
  } finally { globalThis.queueMicrotask = orig; }
  dispose();
  assert.equal(p.textContent, '1');
  assert.equal(calls, 0);
});

test('B5.3 writing an observed linkedSignal in an effect reports EFFECT_WRITES_STATE', () => {
  const cap = capture();
  const a = signal(1);
  const l = linkedSignal({ source: () => 0, computation: () => 0, debugName: 'linked' });
  const dispose = root(() => {
    effect(() => { l(); });
    effect(() => { const v = a(); if (v > 1) l.set(v); });
  });
  flush();
  a.set(2); flush();
  cap.stop();
  dispose();
  assert.equal(l(), 2);
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
});

test('B5.4 setup writing a linkedSignal created elsewhere reports WRITE_IN_SETUP', () => {
  const cap = capture();
  const l = linkedSignal({ source: () => 0, computation: () => 0, debugName: 'foreign-linked' });
  withTarget((el) => {
    const unmount = mount(() => { l.set(4); return h.div(null); }, el);
    unmount();
  });
  cap.stop();
  assert.equal(l(), 4);
  assert.deepEqual(cap.codes(), ['WRITE_IN_SETUP']);
});
