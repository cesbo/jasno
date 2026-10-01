import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, flush, resource, signal } from '@jasno/core';
import { capture, deferred, tick } from './helpers.ts';

type Status = 'idle' | 'loading' | 'reloading' | 'resolved' | 'error' | 'local';

function setup() {
  const params = signal<number | undefined>(1);
  const calls: { params: unknown; abortSignal: AbortSignal; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];
  let dispose = () => {};
  const r = createRoot((d) => {
    dispose = d;
    return resource({
      params,
      loader: ({ params: p, abortSignal }) => {
        const x = deferred<string>();
        calls.push({ params: p, abortSignal, resolve: x.resolve, reject: x.reject });
        return x.promise;
      },
      debugName: 'r',
    });
  });
  const last = () => calls[calls.length - 1]!;
  return { params, r, calls, last, dispose };
}

type H = ReturnType<typeof setup>;

const reach: Record<Status, (x: H) => Promise<void>> = {
  idle: async (x) => { x.params.set(undefined); flush(); },
  loading: async () => {},
  resolved: async (x) => { x.last().resolve('v1'); await tick(); },
  error: async (x) => { x.last().reject(new Error('e1')); await tick(); },
  local: async (x) => { x.last().resolve('v1'); await tick(); x.r.set('mine'); },
  reloading: async (x) => { x.last().resolve('v1'); await tick(); x.r.reload(); flush(); },
};

const events: Record<string, (x: H) => Promise<void>> = {
  'params → undefined': async (x) => { x.params.set(undefined); },
  'params change': async (x) => { x.params.set(2); },
  'reload()': async (x) => { x.r.reload(); },
  'set(v)': async (x) => { x.r.set('set'); },
  'fulfils': async (x) => { x.last().resolve('late'); await tick(); },
  'rejects': async (x) => { x.last().reject(new Error('late')); await tick(); },
};

// B9.14; '-' cells (no current request) are skipped.
const table: Record<Status, (Status | '-')[]> = {
  idle: ['idle', 'loading', 'idle', 'idle', '-', '-'],
  loading: ['idle', 'loading', 'loading', 'local', 'resolved', 'error'],
  reloading: ['idle', 'loading', 'reloading', 'local', 'resolved', 'error'],
  resolved: ['idle', 'loading', 'reloading', 'local', '-', '-'],
  error: ['idle', 'loading', 'loading', 'local', '-', '-'],
  local: ['idle', 'loading', 'reloading', 'local', '-', '-'],
};

for (const [from, row] of Object.entries(table) as [Status, (Status | '-')[]][]) {
  Object.keys(events).forEach((ev, i) => {
    const to = row[i]!;
    if (to === '-') return;
    test(`B9.14 ${from} + ${ev} → ${to}`, async () => {
      const cap = capture();
      const x = setup();
      await reach[from](x);
      assert.equal(x.r.status(), from, 'precondition');
      await events[ev]!(x);
      assert.equal(x.r.status(), to, 'read-your-writes, before the flush');
      flush();
      await tick();
      assert.equal(x.r.status(), to);
      assert.equal(x.r.isLoading(), to === 'loading' || to === 'reloading');
      assert.equal(x.r.hasValue(), to === 'resolved' || to === 'local' || to === 'reloading');
      if (to === 'error') assert.throws(() => x.r.value());
      cap.stop();
      assert.deepEqual(cap.codes(), from === 'loading' && ev === 'set(v)' ? ['RESOURCE_SET_WHILE_LOADING'] : []);
      x.dispose();
    });
  });
}

test('B9.6 stale and aborted settlements are ignored; the loader\'s own AbortError is an error', async () => {
  const x = setup();
  const first = x.last();
  x.params.set(2); flush();
  assert.equal(first.abortSignal.aborted, true);
  first.resolve('stale'); await tick();
  assert.equal(x.r.status(), 'loading');
  x.last().reject(new DOMException('timeout', 'AbortError')); await tick();
  assert.equal(x.r.status(), 'error');
  assert.equal((x.r.error() as DOMException).name, 'AbortError');
  x.dispose();
});

test('B9.6 a failed reload() drops the kept value (as Angular)', async () => {
  const x = setup();
  x.last().resolve('v1'); await tick();
  x.r.reload(); flush();
  assert.equal(x.r.value(), 'v1');
  x.last().reject(new Error('down')); await tick();
  assert.equal(x.r.status(), 'error');
  assert.equal(x.r.hasValue(), false);
  x.dispose();
});

test('B9.3 params compare one level deep; B9.10 disposal aborts the request', async () => {
  const id = signal(1);
  const other = signal(0);
  let loads = 0;
  let signalSeen: AbortSignal | undefined;
  let dispose = () => {};
  createRoot((d) => {
    dispose = d;
    return resource({
      params: () => { other(); return { id: id() }; },
      loader: ({ abortSignal }) => { loads++; signalSeen = abortSignal; return new Promise<string>(() => {}); },
    });
  });
  other.set(1); flush();
  assert.equal(loads, 1);
  id.set(2); flush();
  assert.equal(loads, 2);
  dispose();
  assert.equal(signalSeen!.aborted, true);
});

test('B9.2 a resource without params loads once; B9.4 throwing params give error and start nothing', async () => {
  let loads = 0;
  const bad = signal(false);
  const [once, r2] = createRoot(() => [
    resource({ loader: async () => { loads++; return 'x'; } }),
    resource({ params: () => { if (bad()) throw new Error('bad params'); return 1; }, loader: async () => { loads++; return 'y'; } }),
  ]);
  await tick();
  assert.equal(once.value(), 'x');
  assert.equal(loads, 2);
  bad.set(true);
  assert.equal(r2.status(), 'error');
  assert.equal((r2.error() as Error).message, 'bad params');
  flush(); await tick();
  assert.equal(loads, 2);
});
