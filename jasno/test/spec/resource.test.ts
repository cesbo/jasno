// Spec conformance: resource (design.md B9, B7.2, B7.4, B12.3, ADR-15, Resource JSDoc, RECIPES "Mutations").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catchError, component, computed, createRoot, each, effect, flush, h, mount, onMount, resource, show, signal, untracked,
} from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { capture, codeOf, deferred, tick } from '../helpers.ts';

/** Loader promises that would otherwise never settle; the last test settles them so settled() elsewhere is not held up. */
const outstanding: ((v: any) => void)[] = [];
function forever<T = string>(): Promise<T> {
  const x = deferred<T>();
  outstanding.push(x.resolve);
  return x.promise;
}

interface Call<P> { params: P; abortSignal: AbortSignal; resolve: (v: any) => void; reject: (e: unknown) => void }

/** A resource in its own root whose loader hands out deferreds. */
function mk<P>(params?: (() => P | undefined) | undefined, name = 'probe') {
  const calls: Call<P>[] = [];
  let dispose = () => {};
  const r = createRoot((d) => {
    dispose = d;
    return resource<any, P>({
      params,
      loader: ({ params: p, abortSignal }) => {
        const x = deferred<any>();
        outstanding.push(x.resolve);
        calls.push({ params: p, abortSignal, resolve: x.resolve, reject: x.reject });
        return x.promise;
      },
      debugName: name,
    });
  });
  return { r, calls, last: () => calls[calls.length - 1]!, dispose };
}

const isJasnoAbort = (s: AbortSignal) => s.aborted && s.reason instanceof DOMException && s.reason.name === 'AbortError';
const target = () => { const el = document.createElement('div'); document.body.append(el); return el; };

// ---------------------------------------------------------------- B9.1 creation

test('B9.1/B6.11 resource() created inside a computed throws OWNED_IN_DERIVATION', () => {
  const c = computed(() => resource({ loader: () => forever() }));
  assert.throws(() => c(), (e) => codeOf(e) === 'OWNED_IN_DERIVATION');
});

test('B9.1/B6.8 resource() with no owner reports NO_OWNER', () => {
  const cap = capture();
  resource({ loader: () => forever(), debugName: 'orphan' });
  cap.stop();
  assert.ok(cap.codes().includes('NO_OWNER'), cap.codes().join());
});

// ---------------------------------------------------------------- B9.2 no params

test('B9.2 without params: loads once at creation, never again on flushes, again on reload()', async () => {
  const x = mk<undefined>(undefined, 'noparams');
  assert.equal(x.calls.length, 1, 'loads at creation');
  assert.equal(x.r.status(), 'loading');
  x.last().resolve('a'); await tick(); flush(); await tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.r.value(), 'a');
  x.r.reload();
  assert.equal(x.r.status(), 'reloading');
  flush();
  assert.equal(x.calls.length, 2);
  x.last().resolve('b'); await tick();
  assert.equal(x.r.value(), 'b');
  x.dispose();
});

// ---------------------------------------------------------------- B9.3 params equality

function countLoads(params: () => unknown) {
  let loads = 0;
  let dispose = () => {};
  createRoot((d) => { dispose = d; resource({ params, loader: () => { loads++; return forever(); } }); });
  return { loads: () => loads, dispose };
}

test('B9.3 arrays compare one level deep: same members do not refetch, a length change does', () => {
  const s = signal([1, 2]);
  const x = countLoads(() => [...s()]);
  s.set([1, 2]); flush();
  assert.equal(x.loads(), 1);
  s.set([1, 2, 3]); flush();
  assert.equal(x.loads(), 2);
  s.set([1, 2, 4]); flush();
  assert.equal(x.loads(), 3);
  x.dispose();
});

test('B9.3 only one level: a fresh nested object member refetches', () => {
  const s = signal(0);
  const x = countLoads(() => { s(); return { filter: { q: 'a' } }; });
  s.set(1); flush();
  assert.equal(x.loads(), 2);
  x.dispose();
});

test('B9.3 key order does not matter; different keys with undefined values are different', () => {
  const s = signal<Record<string, unknown>>({ a: 1, b: 2 });
  const x = countLoads(() => ({ ...s() }));
  s.set({ b: 2, a: 1 }); flush();
  assert.equal(x.loads(), 1, 'same keys, other order');
  s.set({ a: undefined }); flush();
  assert.equal(x.loads(), 2);
  s.set({ b: undefined }); flush();
  assert.equal(x.loads(), 3, '{a: undefined} vs {b: undefined}');
  s.set({ b: undefined, c: 1 }); flush();
  assert.equal(x.loads(), 4);
  x.dispose();
});

test('B9.3 non-plain objects (Date, class instance) compare with Object.is', () => {
  class Q { q: string; constructor(q: string) { this.q = q; } }
  const s = signal(0);
  const d = countLoads(() => { s(); return new Date(0); });
  const c = countLoads(() => { s(); return new Q('a'); });
  s.set(1); flush();
  assert.equal(d.loads(), 2);
  assert.equal(c.loads(), 2);
  d.dispose(); c.dispose();
});

test('B9.3 Object.is corner cases: NaN equals NaN, 0 and -0 differ, [1] differs from {0: 1}', () => {
  const s = signal<unknown>(NaN);
  const x = countLoads(() => s());
  s.set(Number.NaN); flush();
  assert.equal(x.loads(), 1);
  s.set(0); flush();
  assert.equal(x.loads(), 2);
  s.set(-0); flush();
  assert.equal(x.loads(), 3);
  s.set([1]); flush();
  s.set({ 0: 1 }); flush();
  assert.equal(x.loads(), 5);
  x.dispose();
});

test('B9.3/B9.4 an equal inline object keeps the state and value (no loading flash)', async () => {
  const id = signal(1);
  const other = signal(0);
  const x = mk(() => { other(); return { id: id() }; });
  x.last().resolve('v1'); await tick();
  other.set(1);
  assert.equal(x.r.status(), 'resolved');
  assert.equal(x.r.value(), 'v1');
  flush(); await tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.r.status(), 'resolved');
  x.dispose();
});

// ---------------------------------------------------------------- B9.4 pure state

test('B9.4 new params read-your-writes before any flush: loading, no value', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('v1'); await tick();
  id.set(2);
  assert.equal(x.r.status(), 'loading');
  assert.equal(x.r.value(), undefined);
  assert.equal(x.r.hasValue(), false);
  assert.equal(x.r.isLoading(), true);
  assert.equal(x.r.error(), undefined);
  x.dispose();
});

test('B9.4 params changed and changed back before the flush: the old outcome, no new request', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('v1'); await tick();
  id.set(2);
  assert.equal(x.r.status(), 'loading');
  id.set(1);
  assert.equal(x.r.status(), 'resolved');
  assert.equal(x.r.value(), 'v1');
  flush(); await tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.r.status(), 'resolved');
  x.dispose();
});

test('B9.4/B9.5 in-flight request survives params A→B→A before the flush', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  const first = x.last();
  id.set(2); id.set(1);
  flush();
  assert.equal(first.abortSignal.aborted, false);
  assert.equal(x.calls.length, 1);
  first.resolve('v1'); await tick();
  assert.equal(x.r.status(), 'resolved');
  x.dispose();
});

test('B9.4 a local value is kept for its params across a change and back before the flush', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('v1'); await tick();
  x.r.set('mine');
  id.set(2);
  assert.equal(x.r.value(), undefined);
  id.set(1);
  assert.equal(x.r.status(), 'local');
  assert.equal(x.r.value(), 'mine');
  x.dispose();
});

test('B9.4 params A→B→A with the settlement in between: resolved for A, no second request', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  const first = x.last();
  id.set(2);
  first.resolve('v1');
  assert.equal(x.r.status(), 'loading', 'params 2 have no outcome');
  id.set(1);
  await tick(); flush();
  assert.equal(x.r.status(), 'resolved');
  assert.equal(x.r.value(), 'v1');
  assert.equal(x.calls.length, 1);
  x.dispose();
});

test('B9.7 a params change then reload() before the flush: one request, for the new params', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  const first = x.last();
  id.set(2); x.r.reload();
  assert.equal(isJasnoAbort(first.abortSignal), true);
  assert.equal(x.r.status(), 'loading');
  flush();
  assert.deepEqual(x.calls.map((c) => c.params), [1, 2]);
  x.last().resolve('v2'); await tick();
  assert.equal(x.r.value(), 'v2');
  x.dispose();
});

test('B9.14/B9.4 idle + params change → loading, also when the new params equal the ones before idle', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('v1'); await tick();
  id.set(undefined); flush();
  assert.equal(x.r.status(), 'idle');
  id.set(1);
  const before = x.r.status();
  flush(); await tick();
  const after = x.r.status();
  assert.deepEqual([before, after], ['loading', 'loading'], 'status must not change without an event (read-your-writes)');
  x.dispose();
});

test('B9.14/B9.4 idle + params change → loading after an error, not the old error', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().reject(new Error('e1')); await tick();
  id.set(undefined); flush();
  id.set(1);
  assert.equal(x.r.status(), 'loading');
  x.dispose();
});

test('B9.4 throwing params: error with that exact error, value() throws it, no request started', async () => {
  const bad = signal(false);
  const boom = new Error('bad params');
  const x = mk(() => { if (bad()) throw boom; return 1; });
  x.last().resolve('v1'); await tick();
  bad.set(true);
  assert.equal(x.r.status(), 'error');
  assert.equal(x.r.error(), boom);
  assert.throws(() => x.r.value(), (e) => e === boom);
  assert.equal(x.r.hasValue(), false);
  assert.equal(x.r.isLoading(), false);
  flush(); await tick();
  assert.equal(x.calls.length, 1);
  x.dispose();
});

test('B9.4 params throwing then recovering to the same params keeps a stable status across the flush', async () => {
  const bad = signal(false);
  const x = mk(() => { if (bad()) throw new Error('bad'); return 1; });
  x.last().resolve('v1'); await tick();
  bad.set(true); flush();
  bad.set(false);
  const before = x.r.status();
  flush(); await tick();
  assert.equal(x.r.status(), before, `status flipped from ${before} at the flush`);
  x.dispose();
});

test('B9.4/B5.1 a write in params throws WRITE_IN_DERIVATION, which becomes the error state', () => {
  const s = signal(0);
  const cap = capture();
  const x = mk(() => { s.set(1); return 1; });
  cap.stop();
  assert.equal(x.r.status(), 'error');
  assert.equal(codeOf(x.r.error()), 'WRITE_IN_DERIVATION');
  assert.equal(x.calls.length, 0);
  assert.deepEqual(cap.errors, []);
  x.dispose();
});

// ---------------------------------------------------------------- B9.5 request binding

test('B9.5 the loader starts in phase (a) of the next flush, once for several changes, before effects', () => {
  const id = signal<number | undefined>(1);
  const seen: [number, unknown][] = [];
  let calls!: Call<number>[];
  let dispose = () => {};
  createRoot((d) => {
    dispose = d;
    const x = { calls: [] as Call<number>[] };
    calls = x.calls;
    resource<string, number>({
      params: id,
      loader: ({ params, abortSignal }) => { const q = deferred<string>(); calls.push({ params, abortSignal, ...q }); return q.promise; },
    });
    effect(() => { id(); seen.push([calls.length, calls[calls.length - 1]?.params]); });
  });
  flush();
  id.set(2); id.set(3); id.set(4);
  assert.equal(calls.length, 1, 'not called synchronously by the write');
  flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.params, 4);
  assert.deepEqual(seen, [[1, 1], [2, 4]], 'the effect of the same flush sees the new request');
  dispose();
});

test('B9.5/B4.3 params written in onMount (phase b) start the request before flush() returns', () => {
  const id = signal<number | undefined>(1);
  const calls: unknown[] = [];
  let dispose = () => {};
  createRoot((d) => {
    dispose = d;
    resource({ params: id, loader: ({ params }) => { calls.push(params); return forever(); } });
    onMount(() => { id.set(2); });
  });
  flush();
  assert.deepEqual(calls, [1, 2]);
  dispose();
});

test('B9.5 Promise.try: a synchronous loader throw becomes the error state, not a routed error', async () => {
  const boom = new Error('sync');
  const cap = capture();
  let r!: ReturnType<typeof resource<string>>;
  let dispose = () => {};
  assert.doesNotThrow(() => {
    r = createRoot((d) => { dispose = d; return resource<string>({ loader: () => { throw boom; } }); });
  });
  await tick(); flush(); await tick();
  cap.stop();
  assert.equal(r.status(), 'error');
  assert.equal(r.error(), boom);
  assert.deepEqual(cap.errors, []);
  dispose();
});

test('B9.5/B8.8 a synchronously throwing loader in component setup does not break the mount', async (t) => {
  const App = component(function App() {
    const r = resource<string>({ loader: () => { throw new Error('nope'); } });
    return h.p(null, () => r.status());
  });
  const view = mountTest(t, () => App());
  await tick(); flush();
  assert.equal(view.root.textContent, 'error');
});

test('B9.5 Promise.try: a loader returning a plain value resolves with it', async () => {
  const r = createRoot(() => resource<string>({ loader: (() => 'plain') as never }));
  await tick();
  assert.equal(r.status(), 'resolved');
  assert.equal(r.value(), 'plain');
});

test('B9.5/B1.1 the loader is untracked: a signal it reads does not reload', async () => {
  const s = signal(0);
  let loads = 0;
  const cap = capture();
  let dispose = () => {};
  createRoot((d) => { dispose = d; resource({ loader: () => { loads++; s(); return forever(); } }); });
  s.set(1); flush(); await tick();
  cap.stop();
  assert.equal(loads, 1);
  dispose();
});

test('B9.5 the loader runs outside setup and derivations: its synchronous writes are silent', async (t) => {
  const busy = signal(0); // not created by the component: a write in its setup would be WRITE_IN_SETUP
  const id = signal(1);
  // Read busy untracked: a plain read would be LOADER_READ_UNTRACKED, and this test is about writes.
  const App = component(function App() {
    resource({ params: id, loader: () => { busy.set(untracked(busy) + 1); return forever(); } });
    return h.p(null, () => String(busy()));
  });
  const view = mountTest(t, () => App());
  id.set(2); flush();
  assert.equal(busy(), 2);
  assert.equal(view.root.textContent, '2');
});

// ---------------------------------------------------------------- B9.6 settlements

test('B9.6 a request superseded by reload() is ignored whether it fulfils or rejects, and nothing is reported', async () => {
  const cap = capture();
  const x = mk<undefined>(undefined);
  const first = x.last();
  first.resolve('v1'); await tick();
  x.r.reload(); flush();
  const second = x.last();
  x.r.reload(); flush();
  second.resolve('stale'); await tick();
  assert.equal(x.r.status(), 'reloading');
  assert.equal(x.r.value(), 'v1');
  second.reject(new Error('stale')); await tick();
  assert.equal(x.r.status(), 'reloading');
  x.last().resolve('v3'); await tick();
  cap.stop();
  assert.equal(x.r.value(), 'v3');
  assert.deepEqual(cap.errors, []);
  x.dispose();
});

test('B9.6 a request aborted by a params change is ignored even when it rejects with its own error', async () => {
  const cap = capture();
  const id = signal<number | undefined>(1);
  const x = mk(id);
  const first = x.last();
  id.set(2); flush();
  first.reject(new Error('late failure')); await tick();
  cap.stop();
  assert.equal(x.r.status(), 'loading');
  assert.deepEqual(cap.errors, []);
  x.dispose();
});

test('B9.6/B9.9 a rejection with a non-Error keeps the identical value in error() and value()', async () => {
  const x = mk<undefined>(undefined);
  x.last().reject('plain string'); await tick();
  assert.equal(x.r.status(), 'error');
  assert.equal(x.r.error(), 'plain string');
  assert.throws(() => x.r.value(), (e) => e === 'plain string');
  x.dispose();
});

test('B9.12 a loader resolving null is resolved with a value', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve(null); await tick();
  assert.equal(x.r.status(), 'resolved');
  assert.equal(x.r.hasValue(), true);
  assert.equal(x.r.value(), null);
  x.dispose();
});

test('B9.6/B9.8 set() right after creation beats an already-resolved loader', async () => {
  const cap = capture();
  const r = createRoot(() => resource<string>({ loader: async () => 'server', debugName: 'early' }));
  r.set('mine');
  await tick(); flush(); await tick();
  cap.stop();
  assert.equal(r.status(), 'local');
  assert.equal(r.value(), 'mine');
  assert.deepEqual(cap.codes(), ['RESOURCE_SET_WHILE_LOADING']);
});

test('B9.6/B2.3 a reload resolving an equal value does not re-run value() consumers', async () => {
  const x = mk<undefined>(undefined);
  let runs = 0;
  const stop = createRoot(() => effect(() => { x.r.value(); runs++; }));
  flush();
  x.last().resolve('v1'); await tick(); flush();
  const base = runs;
  x.r.reload(); flush();
  x.last().resolve('v1'); await tick(); flush();
  assert.equal(x.r.status(), 'resolved');
  assert.equal(runs, base);
  stop(); x.dispose();
});

test('B9.6 a second failure replaces the error; error() consumers see the new error', async () => {
  const x = mk<undefined>(undefined);
  const seen: unknown[] = [];
  const stop = createRoot(() => effect(() => { seen.push(x.r.error()); }));
  const e1 = new Error('1'), e2 = new Error('2');
  x.last().reject(e1); await tick(); flush();
  x.r.reload();
  assert.equal(x.r.status(), 'loading', 'error + reload() → loading');
  flush();
  x.last().reject(e2); await tick(); flush();
  assert.equal(x.r.error(), e2);
  assert.deepEqual(seen.slice(-3), [e1, undefined, e2]);
  stop(); x.dispose();
});

// ---------------------------------------------------------------- B9.7 reload()

test('B9.7 reload() aborts the in-flight request now, keeps the value, starts the request in the next flush', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.reload(); flush();
  const inflight = x.last();
  x.r.reload();
  assert.equal(isJasnoAbort(inflight.abortSignal), true, 'aborted synchronously with an AbortError');
  assert.equal(x.calls.length, 2, 'no loader call before the flush');
  assert.equal(x.r.value(), 'v1');
  assert.equal(x.r.status(), 'reloading');
  flush();
  assert.equal(x.calls.length, 3);
  assert.notEqual(x.last().abortSignal, inflight.abortSignal);
  x.dispose();
});

test('B9.7/B4.1 reload() schedules its own flush', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.reload();
  await tick();
  assert.equal(x.calls.length, 2);
  x.dispose();
});

test('B9.7 two reload() calls before the flush start one request', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.reload(); x.r.reload();
  flush();
  assert.equal(x.calls.length, 2);
  x.last().resolve('v2'); await tick();
  assert.equal(x.r.value(), 'v2');
  x.dispose();
});

test('B9.7/B9.8 reload() then set() before the flush: no request starts, the set value stays', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.reload(); x.r.set('mine');
  flush(); await tick();
  for (const c of x.calls) c.resolve('server');
  await tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.r.status(), 'local');
  assert.equal(x.r.value(), 'mine');
  x.dispose();
});

test('B9.7 reload() then a params change before the flush: one request, for the new params', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('v1'); await tick();
  x.r.reload(); id.set(2);
  assert.equal(x.r.status(), 'loading');
  assert.equal(x.r.value(), undefined);
  flush();
  assert.deepEqual(x.calls.map((c) => c.params), [1, 2]);
  x.dispose();
});

test('B9.7 reload() from local keeps the local value while reloading; the result replaces it (JSDoc)', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.set('mine');
  x.r.reload();
  assert.equal(x.r.status(), 'reloading');
  assert.equal(x.r.value(), 'mine');
  flush();
  x.last().resolve('server'); await tick();
  assert.equal(x.r.status(), 'resolved');
  assert.equal(x.r.value(), 'server');
  x.dispose();
});

test('B9.7 reload() is a no-op while idle and after disposal', async () => {
  const id = signal<number | undefined>(undefined);
  const x = mk(id);
  x.r.reload(); flush(); await tick();
  assert.equal(x.calls.length, 0);
  assert.equal(x.r.status(), 'idle');
  id.set(1); flush();
  x.last().resolve('v1'); await tick();
  x.dispose();
  x.r.reload(); flush(); await tick();
  assert.equal(x.calls.length, 1);
});

test('B9.7/B9.10 reload() then disposal before the flush: the loader never runs', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.reload();
  x.dispose();
  flush(); await tick();
  assert.equal(x.calls.length, 1);
});

// ---------------------------------------------------------------- B9.8 set()

test('B9.8/B7.2 set() aborts the in-flight request synchronously with an AbortError', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.r.reload(); flush();
  const inflight = x.last();
  x.r.set('mine');
  assert.equal(isJasnoAbort(inflight.abortSignal), true);
  inflight.resolve('server'); await tick();
  assert.equal(x.r.value(), 'mine');
  x.dispose();
});

test('B9.8 set() after a params change but before the flush warns, stores local for the new params, and the flush keeps it', async () => {
  const cap = capture();
  const id = signal<number | undefined>(1);
  const x = mk(id, 'setAfterParams');
  x.last().resolve('v1'); await tick();
  id.set(2);
  x.r.set('for 2');
  flush(); await tick();
  cap.stop();
  assert.deepEqual(cap.codes(), ['RESOURCE_SET_WHILE_LOADING']);
  assert.equal(x.r.status(), 'local');
  assert.equal(x.r.value(), 'for 2');
  id.set(1);
  assert.equal(x.r.status(), 'loading', 'the local value belongs to params 2 only');
  x.dispose();
});

test('B9.8 set() is a no-op after disposal', async () => {
  const x = mk<undefined>(undefined);
  x.last().resolve('v1'); await tick();
  x.dispose();
  x.r.set('late');
  assert.equal(x.r.value(), 'v1');
  assert.equal(x.r.status(), 'resolved');
});

test('B9.8 set() with throwing params leaves the params error in place (B9.4 wins over the table)', () => {
  const x = mk(() => { throw new Error('bad'); });
  x.r.set('mine');
  assert.equal(x.r.status(), 'error');
  x.dispose();
});

test('B9.8 RESOURCE_SET_WHILE_LOADING names the resource', () => {
  const cap = capture();
  const x = mk<undefined>(undefined, 'named-set');
  x.r.set('v');
  cap.stop();
  assert.equal(cap.diags.length, 1);
  assert.match(cap.diags[0]!.message, /set\(\) on resource "named-set" while it loads/);
  x.dispose();
});

// ---------------------------------------------------------------- B9.9 reads

test('B9.9 value() throws and error() returns the identical loader error; hasValue false', async () => {
  const x = mk<undefined>(undefined);
  const boom = new Error('boom');
  x.last().reject(boom); await tick();
  assert.throws(() => x.r.value(), (e) => e === boom);
  assert.equal(x.r.error(), boom);
  assert.equal(x.r.hasValue(), false);
  assert.equal(x.r.isLoading(), false);
  x.dispose();
});

test('B9.9/ADR-15 hasValue() is a tracked read', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  const seen: boolean[] = [];
  const stop = createRoot(() => effect(() => { seen.push(x.r.hasValue()); }));
  flush();
  x.last().resolve('v1'); await tick(); flush();
  id.set(2); flush();
  x.r.set('mine'); flush();
  assert.deepEqual(seen, [false, true, false, true]);
  stop(); x.dispose();
});

test('B9.9 latest(): the value while there is one; after a failed reload the value from before, also while a retry loads', async () => {
  const x = mk<undefined>(undefined);
  assert.equal(x.r.latest(), undefined, 'nothing before the first value');
  x.last().resolve('v1'); await tick();
  assert.equal(x.r.latest(), 'v1');
  x.r.reload(); flush();
  assert.equal(x.r.status(), 'reloading');
  assert.equal(x.r.latest(), 'v1');
  x.last().reject(new Error('down')); await tick();
  assert.equal(x.r.status(), 'error');
  assert.throws(() => x.r.value());
  assert.equal(x.r.hasValue(), false);
  assert.equal(x.r.latest(), 'v1', 'kept after the failure, and it never throws');
  x.r.reload(); flush();
  assert.equal(x.r.status(), 'loading', 'B9.7: no value held, so loading');
  assert.equal(x.r.latest(), 'v1', 'still kept while the retry loads');
  x.last().reject(new Error('down again')); await tick();
  assert.equal(x.r.latest(), 'v1', 'a second failure keeps it too');
  x.r.reload(); flush();
  x.last().resolve('v2'); await tick();
  assert.equal(x.r.latest(), 'v2');
  x.dispose();
});

test('B9.9 latest() never shows another params\' value: undefined after a params change, a failed first load and idle', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('one'); await tick();
  assert.equal(x.r.latest(), 'one');
  id.set(2); flush();
  assert.equal(x.r.status(), 'loading');
  assert.equal(x.r.latest(), undefined, 'loading for new params');
  x.last().reject(new Error('down')); await tick();
  assert.equal(x.r.status(), 'error');
  assert.equal(x.r.latest(), undefined, 'a failed first load for these params has nothing to keep');
  id.set(1); flush();
  assert.equal(x.r.latest(), undefined, 'back to the earlier params: a new load, the old outcome is gone');
  x.last().resolve('one again'); await tick();
  id.set(undefined); flush();
  assert.equal(x.r.status(), 'idle');
  assert.equal(x.r.latest(), undefined);
  x.dispose();
});

test('B9.9 latest() follows set(), keeps a set() value after a failed reload, and is a tracked read', async () => {
  const x = mk<undefined>(undefined);
  const seen: unknown[] = [];
  const stop = createRoot(() => effect(() => { seen.push(x.r.latest()); }));
  flush();
  x.last().resolve('v1'); await tick(); flush();
  x.r.set('mine'); flush();
  x.r.reload(); flush();
  x.last().reject(new Error('down')); await tick(); flush();
  assert.equal(x.r.latest(), 'mine');
  assert.deepEqual(seen, [undefined, 'v1', 'mine'], 'the failure changes status, not latest(): no extra run');
  stop(); x.dispose();
});

test('ADR-15 members are bound: destructured members work', async () => {
  const x = mk<undefined>(undefined);
  const { value, status, error, isLoading, hasValue, reload, set } = x.r;
  x.last().resolve('v1'); await tick();
  assert.equal(value(), 'v1');
  assert.equal(status(), 'resolved');
  assert.equal(error(), undefined);
  assert.equal(isLoading(), false);
  assert.equal(hasValue(), true);
  reload();
  assert.equal(status(), 'reloading');
  set('mine');
  assert.equal(value(), 'mine');
  x.dispose();
});

test('B8.8/B8.3 a live value() read in a binding routes the loader error to catchError', async (t) => {
  const boom = new Error('load failed');
  let fail!: (e: unknown) => void;
  const App = component(function App() {
    const r = resource<string>({ loader: () => new Promise<string>((_, rej) => { fail = rej; }) });
    return h.div(null, catchError(() => h.p(null, r.value), (e) => h.p({ class: 'err' }, (e as Error).message)));
  });
  const view = mountTest(t, () => App());
  fail(boom); await tick(); flush();
  assert.equal(view.root.querySelector('.err')?.textContent, 'load failed');
});

// ---------------------------------------------------------------- B9.10 disposal

test('B9.10/B7.4 disposal aborts with an AbortError; later settlements are ignored and not reported', async () => {
  const cap = capture();
  const x = mk<undefined>(undefined);
  const first = x.last();
  x.dispose();
  assert.equal(isJasnoAbort(first.abortSignal), true);
  first.reject(new Error('after dispose')); await tick();
  first.resolve('after'); await tick();
  cap.stop();
  assert.deepEqual(cap.errors, []);
  assert.equal(x.r.status(), 'loading');
});

test('B9.10/B6.3 after disposal a params change starts no request', () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.dispose();
  id.set(2); flush();
  assert.equal(x.calls.length, 1);
});

test('B9.5/B8.4 a loader throwing synchronously in phase (a) does not stop the flush', () => {
  const id = signal(1);
  const seen: number[] = [];
  let dispose = () => {};
  const r = createRoot((d) => {
    dispose = d;
    const r = resource<string, number>({ params: id, loader: ({ params }) => { if (params === 2) throw new Error('sync 2'); return forever(); } });
    effect(() => { seen.push(id()); });
    return r;
  });
  flush();
  id.set(2);
  assert.doesNotThrow(() => flush());
  assert.deepEqual(seen, [1, 2]);
  return tick().then(() => {
    assert.equal(r.status(), 'error');
    assert.equal((r.error() as Error).message, 'sync 2');
    dispose();
  });
});

test('B9.10 a resource in a show branch is aborted when the branch goes away', (t) => {
  const on = signal(true);
  let sig: AbortSignal | undefined;
  mountTest(t, () => h.div(null, show(on, () => {
    resource({ loader: ({ abortSignal }) => { sig = abortSignal; return forever(); } });
    return h.p(null, 'x');
  })));
  assert.equal(sig!.aborted, false);
  on.set(false); flush();
  assert.equal(isJasnoAbort(sig!), true);
});

// ---------------------------------------------------------------- B7.2 / B7.4 abort signals

test('B7.2/B7.4 every supersession aborts with a jasno AbortError; each request gets a fresh signal', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  const a = x.last();
  id.set(2); flush();
  assert.equal(isJasnoAbort(a.abortSignal), true, 'params change');
  const b = x.last();
  x.r.reload();
  assert.equal(isJasnoAbort(b.abortSignal), true, 'reload()');
  flush();
  const c = x.last();
  x.r.set('v');
  assert.equal(isJasnoAbort(c.abortSignal), true, 'set()');
  x.r.reload(); flush();
  const d = x.last();
  id.set(undefined); flush();
  assert.equal(isJasnoAbort(d.abortSignal), true, 'params → undefined');
  assert.equal(new Set([a, b, c, d].map((q) => q.abortSignal)).size, 4);
  x.dispose();
});

test('B7.4 the loader\'s own timeout (TimeoutError) and own controller are error states', async () => {
  const own = new AbortController();
  const [t1, t2] = createRoot(() => [
    resource<string>({ loader: ({ abortSignal }) => new Promise<string>((_, rej) => {
      const s = AbortSignal.timeout(1);
      s.addEventListener('abort', () => rej(s.reason));
      abortSignal.addEventListener('abort', () => rej(abortSignal.reason));
    }) }),
    resource<string>({ loader: ({ abortSignal }) => new Promise<string>((_, rej) => {
      const s = AbortSignal.any([abortSignal, own.signal]);
      s.addEventListener('abort', () => rej(s.reason));
    }) }),
  ]);
  own.abort();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(t1.status(), 'error');
  assert.equal((t1.error() as DOMException).name, 'TimeoutError');
  assert.equal(t2.status(), 'error');
  assert.equal((t2.error() as DOMException).name, 'AbortError');
});

// ---------------------------------------------------------------- B9.11 PENDING_READ_UNTRACKED

test('B9.11 value() in component setup while loading throws PENDING_READ_UNTRACKED; mount rethrows', () => {
  const cap = capture();
  const el = target();
  const Page = component(function Page() {
    const r = resource<string>({ loader: () => forever(), debugName: 'user' });
    return h.p(null, String(r.value()));
  });
  let err: unknown;
  try { mount(() => Page(), el); } catch (e) { err = e; }
  cap.stop();
  el.remove();
  assert.equal(codeOf(err), 'PENDING_READ_UNTRACKED');
  assert.match((err as Error).message, /Resource "user" was read in <Page> while loading/);
  assert.ok(!cap.codes().includes('STRICT_READ_UNTRACKED'), 'thrown instead of the warning');
});

test('B9.11 value() in setup while idle throws PENDING_READ_UNTRACKED', () => {
  const cap = capture();
  const el = target();
  let err: unknown;
  try {
    mount(() => {
      const r = resource<string, number>({ params: () => undefined, loader: () => forever() });
      return h.p(null, String(r.value()));
    }, el);
  } catch (e) { err = e; }
  cap.stop();
  el.remove();
  assert.equal(codeOf(err), 'PENDING_READ_UNTRACKED');
  assert.match((err as Error).message, /while idle/);
});

test('B9.11 value() in a show builder while loading throws PENDING_READ_UNTRACKED', () => {
  const cap = capture();
  const el = target();
  let err: unknown;
  try {
    mount(() => {
      const r = resource<string>({ loader: () => forever() });
      return h.div(null, show(() => true, () => h.p(null, String(r.value()))));
    }, el);
  } catch (e) { err = e; }
  cap.stop();
  el.remove();
  assert.equal(codeOf(err), 'PENDING_READ_UNTRACKED');
});

test('B9.11/B12.2 value() through untracked() or in onMount while loading is silent', (t) => {
  let a: unknown = 'unset', b: unknown = 'unset';
  mountTest(t, () => {
    const r = resource<string>({ loader: () => forever() });
    a = untracked(() => r.value());
    onMount(() => { b = r.value(); });
    return h.p(null, 'x');
  });
  assert.equal(a, undefined);
  assert.equal(b, undefined);
});

test('B9.11/B12.4 status()/hasValue() in setup and value() once resolved warn STRICT_READ_UNTRACKED instead of throwing', async () => {
  const r = createRoot(() => resource<string>({ loader: async () => 'v', debugName: 'strictres' }));
  const cap = capture();
  const el = target();
  let unmount = () => {};
  assert.doesNotThrow(() => { unmount = mount(() => { r.status(); r.hasValue(); return h.p(null, 'x'); }, el); });
  await tick();
  let got: unknown;
  const un2 = mount(() => { got = r.value(); return h.p(null, 'y'); }, el);
  cap.stop();
  unmount(); un2(); el.remove();
  assert.equal(got, 'v');
  assert.ok(cap.codes().length >= 2);
  assert.ok(cap.codes().every((c) => c === 'STRICT_READ_UNTRACKED'), cap.codes().join());
});

test('B9.11/B9.13 value() of a loading resource read in another loader warns LOADER_READ_UNTRACKED, no throw', () => {
  const cap = capture();
  const [, b] = createRoot(() => {
    const a = resource<string>({ loader: () => forever(), debugName: 'upstream' });
    const b = resource<string>({ loader: () => { a.value(); return forever(); }, debugName: 'downstream' });
    return [a, b];
  });
  cap.stop();
  assert.equal(b.status(), 'loading');
  assert.deepEqual(cap.codes(), ['LOADER_READ_UNTRACKED']);
});

// ---------------------------------------------------------------- B9.13 / B12.3 loader label

test('B9.13 LOADER_READ_UNTRACKED: synchronous signal and computed reads warn; untracked() and post-await reads do not', async () => {
  const s = signal(1, { debugName: 'tok' });
  const c = computed(() => s() * 2, { debugName: 'double' });
  const late = signal(0, { debugName: 'late' });
  const q = signal(0, { debugName: 'quiet' });
  const cap = capture();
  const r = createRoot(() => resource<string>({
    loader: async () => { s(); c(); untracked(q); await 0; late(); return 'ok'; },
    debugName: 'loaderlabel',
  }));
  await tick();
  cap.stop();
  assert.equal(r.status(), 'resolved');
  assert.deepEqual(cap.codes(), ['LOADER_READ_UNTRACKED', 'LOADER_READ_UNTRACKED']);
  assert.match(cap.diags[0]!.message, /Signal "tok" was read in the loader of resource "loaderlabel"; changing it will not reload\./);
  assert.match(cap.diags[1]!.message, /"double"/);
});

test('B9.13/B12.5 repeated loader reads at one call site are one diagnostic with a count', async () => {
  const s = signal(1, { debugName: 'dedup-sig' });
  const cap = capture();
  const r = createRoot(() => resource<string>({ loader: async () => { s(); return 'x'; }, debugName: 'dedup' }));
  await tick();
  r.reload(); flush(); await tick();
  cap.stop();
  assert.equal(cap.diags.length, 1);
  assert.equal(cap.diags[0]!.count, 2);
});

test('B12.3/B12.4 a loader called during component setup reports LOADER_READ_UNTRACKED, not STRICT_READ_UNTRACKED', (t) => {
  const s = signal(1, { debugName: 'insetup' });
  const App = component(function App() {
    resource({ loader: () => { s(); return forever(); }, debugName: 'setupres' });
    return h.p(null, 'x');
  });
  const view = mountTest(t, () => App(), { expect: ['LOADER_READ_UNTRACKED' as never] }); // a fix-not-expect code, on purpose
  assert.deepEqual(view.diagnostics.map((d) => d.code), ['LOADER_READ_UNTRACKED']);
});

test('B12.3 the setup label is restored after the loader returns (also after a synchronous throw)', () => {
  const s = signal(1, { debugName: 'after-loader' });
  const cap = capture();
  const el = target();
  const App = component(function Restore() {
    resource({ loader: () => forever() });
    resource<string>({ loader: () => { throw new Error('sync'); } });
    s();
    return h.p(null, 'x');
  });
  const unmount = mount(() => App(), el);
  cap.stop();
  unmount(); el.remove();
  assert.deepEqual(cap.codes(), ['STRICT_READ_UNTRACKED']);
  assert.match(cap.diags[0]!.message, /<Restore>/);
});

test('B9.13 reads in params are silent (params is a derivation)', (t) => {
  const id = signal(1);
  const App = component(function App() {
    const r = resource({ params: () => ({ id: id() }), loader: () => forever() });
    return h.p(null, () => r.status());
  });
  mountTest(t, () => App());
});

test('B9.4/B9.5 chained resources: params reading another resource start when it resolves; its error becomes params error', async () => {
  const a = mk<undefined>(undefined, 'chain-a');
  const calls: unknown[] = [];
  const b = createRoot(() => resource<string, string>({
    params: () => (a.r.hasValue() ? a.r.value() : undefined),
    loader: ({ params }) => { calls.push(params); return forever(); },
  }));
  assert.equal(b.status(), 'idle');
  a.last().resolve('u1'); await tick(); flush();
  assert.deepEqual(calls, ['u1']);
  assert.equal(b.status(), 'loading');
  const b2 = createRoot(() => resource<string, string>({ params: () => a.r.value(), loader: () => forever() }));
  a.r.reload(); flush();
  const boom = new Error('a failed');
  a.last().reject(boom); await tick();
  assert.equal(b2.status(), 'error');
  assert.equal(b2.error(), boom);
  a.dispose();
});

test('B9.3 sparse arrays compare Object.is per member (a hole is undefined, not equal to 2)', () => {
  const s = signal(0);
  const x = countLoads(() => {
    const a: number[] = [1, 2, 3];
    if (s() === 1) delete a[1];
    return a;
  });
  s.set(1); flush();
  assert.equal(x.loads(), 2, '[1, <hole>, 3] vs [1, 2, 3]');
  x.dispose();
});

test('B9.4 null params are defined: the loader runs with null', () => {
  const calls: unknown[] = [];
  const r = createRoot(() => resource<string, null>({ params: () => null, loader: ({ params }) => { calls.push(params); return forever(); } }));
  assert.equal(r.status(), 'loading');
  assert.deepEqual(calls, [null]);
});

test('B9.11 the documented fix, show(() => r.hasValue() && r.value(), ...), renders silently', async (t) => {
  let done!: (v: string) => void;
  const App = component(function App() {
    const r = resource<string>({ loader: () => new Promise<string>((res) => { done = res; }) });
    return h.div(null, show(() => r.hasValue() && r.value(), (v) => h.p(null, v), () => h.p(null, 'Loading')));
  });
  const view = mountTest(t, () => App());
  assert.equal(view.root.textContent, 'Loading');
  done('Ada'); await tick(); flush();
  assert.equal(view.root.textContent, 'Ada');
});

test('B12.3/B12.5 one loader function shared by two resources reports once per resource label', () => {
  const s = signal(1, { debugName: 'shared-read' });
  const load = () => { s(); return forever(); };
  const cap = capture();
  createRoot(() => { resource({ loader: load, debugName: 'shared-a' }); resource({ loader: load, debugName: 'shared-b' }); });
  cap.stop();
  assert.equal(cap.diags.length, 2);
  assert.match(cap.diags[0]!.message, /"shared-a"/);
  assert.match(cap.diags[1]!.message, /"shared-b"/);
});

test('B19.6/B9.10 settled() does not wait for the loader of a disposed resource (its result is ignored)', async () => {
  let release!: () => void;
  const dispose = createRoot((d) => {
    resource({ loader: () => new Promise<string>((res) => { release = () => res('late'); }), debugName: 'abandoned-loader' });
    return d;
  });
  dispose();
  let msg = '';
  try { await settled({ timeout: 100 }); } catch (e) { msg = (e as Error).message; }
  release();
  assert.doesNotMatch(msg, /abandoned-loader/);
});

test('B9.1/B1.1 an effect that creates a resource does not track the resource internals', async () => {
  const k = signal(0);
  let runs = 0;
  let done!: (v: string) => void;
  const stop = createRoot(() => effect(() => {
    k();
    runs++;
    resource<string>({ loader: () => new Promise<string>((res) => { done = res; }) });
  }));
  flush();
  assert.equal(runs, 1);
  done('x'); await tick(); flush();
  assert.equal(runs, 1, 'the settlement does not re-run the creating effect');
  stop();
});

test('B9.4/B2.3 status consumers: a params change re-runs them once, the request start does not re-run them again', async () => {
  const id = signal<number | undefined>(1);
  const x = mk(id);
  x.last().resolve('v1'); await tick();
  const seen: string[] = [];
  const c = computed(() => x.r.status());
  const stop = createRoot(() => effect(() => { seen.push(c()); }));
  flush();
  id.set(2);
  assert.equal(c(), 'loading', 'read-your-writes through a computed');
  flush();
  assert.deepEqual(seen, ['resolved', 'loading']);
  x.last().resolve('v2'); await tick(); flush();
  assert.deepEqual(seen, ['resolved', 'loading', 'resolved']);
  stop(); x.dispose();
});

// ---------------------------------------------------------------- RECIPES "Mutations": optimistic saves (ADR-15)

interface Card { id: string; title: string }
type Cards = ReturnType<typeof resource<readonly Card[]>>;

/** The recipe verbatim, with its free names (cards, saveTitle, toast) injected. */
function recipe(cards: Cards, saveTitle: (id: string, title: string, s: AbortSignal) => Promise<void>, toast: (m: string) => void) {
  const confirmed = new Map<string, string>();     // last title the server accepted, while saves are queued
  const queue = new Map<string, Promise<void>>();  // the last queued save per card
  function rename(id: string, title: string): Promise<void> {
    if (!cards.hasValue()) return Promise.resolve();
    const show = (to: string) => { if (cards.hasValue())
      cards.set(cards.value().map((c) => (c.id === id ? { ...c, title: to } : c))); };
    if (!confirmed.has(id)) confirmed.set(id, cards.value().find((c) => c.id === id)?.title ?? title);
    show(title);
    const run: Promise<void> = (queue.get(id) ?? Promise.resolve()).then(async () => {
      const last = () => queue.get(id) === run;
      try { await saveTitle(id, title, AbortSignal.timeout(10_000)); confirmed.set(id, title); if (last()) show(title); }
      catch { if (last()) { show(confirmed.get(id) ?? title); toast('Not saved; your change was undone'); } }
      finally { if (last()) { queue.delete(id); confirmed.delete(id); } }
    });
    queue.set(id, run);
    return run;
  }
  return { rename, confirmed, queue };
}

/** A fake server plus controllable saves and reloads. */
function world(snapshotAt: 'call' | 'resolve' = 'call') {
  const server = { title: 'A' };
  const saves: { title: string; ok: () => void; fail: () => void }[] = [];
  const loads: (() => void)[] = [];
  const toasts: string[] = [];
  let dispose = () => {};
  const cards = createRoot((d) => {
    dispose = d;
    return resource<readonly Card[]>({
      loader: () => new Promise<readonly Card[]>((res) => {
        const snap = server.title;
        loads.push(() => res([{ id: '1', title: snapshotAt === 'call' ? snap : server.title }]));
      }),
      debugName: 'cards',
    });
  });
  const saveTitle = (_id: string, title: string) => new Promise<void>((res, rej) => {
    saves.push({ title, ok: () => { server.title = title; res(); }, fail: () => rej(new Error('timeout')) });
  });
  const api = recipe(cards, saveTitle, (m) => toasts.push(m));
  const screen = () => (cards.hasValue() ? cards.value().find((c) => c.id === '1')?.title : `<${cards.status()}>`);
  return { server, saves, loads, toasts, cards, screen, dispose, ...api };
}

test('Recipe: a failed save undoes to the server value and toasts; a successful one stays', async () => {
  const w = world();
  w.loads.shift()!(); await tick();
  const p1 = w.rename('1', 'B');
  assert.equal(w.screen(), 'B', 'optimistic');
  await tick();
  w.saves[0]!.fail(); await p1;
  assert.equal(w.screen(), 'A');
  assert.deepEqual(w.toasts, ['Not saved; your change was undone']);
  const p2 = w.rename('1', 'C'); await tick();
  w.saves[1]!.ok(); await p2;
  assert.equal(w.screen(), 'C');
  assert.equal(w.cards.status(), 'local');
  w.dispose();
});

test('Recipe (ADR-15 review case): two overlapping saves both failing, earlier first, end on the server value', async () => {
  const w = world();
  w.loads.shift()!(); await tick();
  const p1 = w.rename('1', 'B');
  const p2 = w.rename('1', 'C');
  await tick();
  assert.equal(w.saves.length, 1, 'saves of one record are serialized');
  w.saves[0]!.fail(); await tick();
  assert.equal(w.screen(), 'C', 'an earlier failure changes nothing');
  w.saves[1]!.fail(); await Promise.all([p1, p2]);
  assert.equal(w.screen(), 'A');
  assert.equal(w.queue.size, 0);
  assert.equal(w.confirmed.size, 0);
  w.dispose();
});

test('Recipe: a concurrent reload() replacing an in-flight optimistic value is corrected by the successful save', async () => {
  const w = world();
  w.loads.shift()!(); await tick();
  const p = w.rename('1', 'B'); await tick();
  w.cards.reload(); flush();
  w.loads.shift()!(); await tick();
  assert.equal(w.screen(), 'A', 'JSDoc: the reload result replaces the optimistic value');
  w.saves[0]!.ok(); await p;
  assert.equal(w.screen(), 'B');
  w.dispose();
});

test('Recipe: every interleaving of up to 3 saves with at most one reload() ends with the screen equal to the server', async () => {
  type Ev = 'R' | 'S+' | 'S-' | 'L' | 'Lr';
  const seqs: Ev[][] = [];
  const gen = (n: number, r: number, s: number, l: number, acc: Ev[]) => {
    if (r === n && s === n && l !== 1) seqs.push([...acc]);
    if (r < n) gen(n, r + 1, s, l, [...acc, 'R']);
    if (s < r) { gen(n, r, s + 1, l, [...acc, 'S+']); gen(n, r, s + 1, l, [...acc, 'S-']); }
    if (l === 0) gen(n, r, s, 1, [...acc, 'L']);
    if (l === 1) gen(n, r, s, 2, [...acc, 'Lr']);
  };
  for (const n of [1, 2, 3]) gen(n, 0, 0, 0, []);
  const bad: string[] = [];
  for (const mode of ['call', 'resolve'] as const) {
    for (const seq of seqs) {
      const w = world(mode);
      w.loads.shift()!(); await tick();
      const runs: Promise<void>[] = [];
      let renames = 0, settled = 0;
      for (const ev of seq) {
        if (ev === 'R') runs.push(w.rename('1', `T${++renames}`));
        else if (ev === 'S+') w.saves[settled++]!.ok();
        else if (ev === 'S-') w.saves[settled++]!.fail();
        else if (ev === 'L') w.cards.reload();
        else w.loads.shift()!();
        flush(); await tick();
      }
      await Promise.all(runs); flush();
      if (w.screen() !== w.server.title || w.queue.size || w.confirmed.size) {
        bad.push(`${mode} ${seq.join(' ')}: screen ${w.screen()} server ${w.server.title}`);
      }
      w.dispose();
    }
  }
  assert.ok(seqs.length > 1000, String(seqs.length));
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of ${seqs.length * 2} interleavings failed`);
});

test('Recipe: renders through each() in mountTest with no diagnostics; a rename from a handler updates the row', async (t) => {
  const w = world();
  w.loads.shift()!(); await tick();
  let pending: Promise<void> | undefined;
  const view = mountTest(t, () => h.ul(null, each(() => (w.cards.hasValue() ? w.cards.value() : []), {
    key: (c) => c.id,
    render: (c) => h.li(null, h.button({ type: 'button', onclick: () => { pending = w.rename(c().id, 'B'); } }, () => c().title)),
  })));
  assert.equal(view.root.textContent, 'A');
  view.root.querySelector('button')!.click();
  flush();
  assert.equal(view.root.textContent, 'B');
  await tick();
  w.saves[0]!.fail(); await pending; flush();
  assert.equal(view.root.textContent, 'A');
  w.dispose();
});

test('probe cleanup: settle every loader promise this file left pending', async () => {
  for (const f of outstanding.splice(0)) f(null);
  await tick();
});
