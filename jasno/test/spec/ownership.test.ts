// Spec conformance: B6 ownership and disposal, B7 AbortSignal per owner and run, B8 errors and boundaries (ADR-13, ADR-16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catchError, component, computed, createContext, createRoot, each, effect, flush, h, linkedSignal, match, mount, onMount,
  provide, resource, show, signal, untracked, useContext,
} from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { hooks } from '../../src/core.ts';
import { capture, codeOf, deferred, tick } from '../helpers.ts';

type Ctx = { readonly abortSignal: AbortSignal };

function host(view: () => Node) {
  const target = document.createElement('div');
  document.body.append(target);
  const unmount = mount(view, target);
  return { target, unmount: () => { unmount(); target.remove(); } };
}

// A loader promise that settles when aborted (so jasno/testing's pending set drains).
const hang = (abortSignal: AbortSignal) =>
  new Promise<never>((_, reject) => abortSignal.addEventListener('abort', () => reject(abortSignal.reason)));

// ---------------------------------------------------------------- B6.3 disposal order

test('B6.3 children are disposed in reverse creation order, recursively, before the parent aborts and cleans up', () => {
  const log: string[] = [];
  const dispose = createRoot((d) => {
    createRoot(() => {
      createRoot(() => { onMount(() => () => log.push('a1')); });
      createRoot(() => { onMount(() => () => log.push('a2')); });
      onMount(() => () => log.push('A'));
    });
    createRoot(() => { onMount(() => () => log.push('B')); });
    onMount(({ abortSignal }) => {
      abortSignal.addEventListener('abort', () => log.push('abort root'));
      return () => log.push('root');
    });
    return d;
  });
  flush();
  dispose();
  assert.deepEqual(log, ['B', 'a2', 'a1', 'A', 'abort root', 'root']);
});

test('B6.3/B7.4 the owner abort reason is a DOMException named AbortError and cleanups see the signal aborted', () => {
  let seen: unknown;
  const dispose = createRoot((d) => {
    onMount(({ abortSignal }) => () => { seen = { aborted: abortSignal.aborted, reason: abortSignal.reason }; });
    return d;
  });
  flush();
  dispose();
  const s = seen as { aborted: boolean; reason: unknown };
  assert.equal(s.aborted, true);
  assert.ok(s.reason instanceof DOMException);
  assert.equal((s.reason as DOMException).name, 'AbortError');
});

test('B6.3 cleanups run untracked: a signal read in the previous run\'s cleanup does not subscribe the effect', () => {
  const s = signal(0), other = signal(0);
  let runs = 0;
  const dispose = createRoot((d) => {
    effect(() => { s(); runs++; return () => { other(); }; });
    return d;
  });
  flush();
  s.set(1); flush(); // the cleanup of run 1 read other during the re-run
  assert.equal(runs, 2);
  other.set(1); flush();
  assert.equal(runs, 2, 'other was read in a cleanup: not a dependency');
  dispose();
});

test('B6.3 cleanups run with no current owner (useContext throws CONTEXT_OUTSIDE_OWNER, effect() reports NO_OWNER)', () => {
  const Theme = createContext<string>('Theme', 'default');
  const cap = capture();
  let code: string | undefined;
  let stop: (() => void) | undefined;
  const dispose = createRoot((d) => provide(Theme, 'dark', () => {
    onMount(() => () => {
      try { useContext(Theme); } catch (e) { code = codeOf(e); }
      stop = effect(() => {});
    });
    return d as unknown as Node;
  })) as unknown as () => void;
  flush();
  dispose();
  cap.stop();
  stop?.();
  assert.equal(code, 'CONTEXT_OUTSIDE_OWNER');
  assert.ok(cap.codes().includes('NO_OWNER'), `codes: ${cap.codes()}`);
});

test('B6.3 cleanups run without a strict label even when disposal happens during setup', () => {
  const s = signal(0, { debugName: 'readInCleanup' });
  let disposeRoot!: () => void;
  createRoot((d) => { disposeRoot = d; onMount(() => () => { s(); }); });
  flush();
  const cap = capture();
  const App = component(function App(): Node { disposeRoot(); return h.p(null, 'x'); });
  const { unmount } = host(() => App());
  unmount();
  cap.stop();
  assert.deepEqual(cap.codes(), []);
});

test('B6.3 a throwing cleanup is reported and does not stop the remaining steps', () => {
  const cap = capture();
  const log: string[] = [];
  const s = signal(1);
  let calls = 0;
  let c!: () => number;
  const boom = new Error('cleanup boom');
  const dispose = createRoot((d) => {
    c = computed(() => { calls++; return s() * 2; });
    effect(() => { c(); });
    createRoot(() => { onMount(() => () => { log.push('child'); throw new Error('child boom'); }); });
    onMount(({ abortSignal }) => { abortSignal.addEventListener('abort', () => log.push('abort')); return () => log.push('first'); });
    onMount(() => () => { log.push('second'); throw boom; });
    onMount(() => () => log.push('third'));
    return d;
  });
  flush();
  dispose();
  cap.stop();
  assert.deepEqual(log, ['child', 'abort', 'third', 'second', 'first']);
  assert.equal(cap.errors.length, 2);
  assert.ok(cap.errors.includes(boom));
  const before = calls;
  c(); c();
  assert.equal(calls, before + 2, 'step 5 ran: the computed is disposed (uncached)');
});

test('B6.3 step 5: a computed owned by a disposed owner links nothing, so a live reader stops depending on it', () => {
  const s = signal(1), bump = signal(0);
  let c!: () => number;
  const disposeA = createRoot((d) => { c = computed(() => s() * 10); return d; });
  const seen: number[] = [];
  const disposeB = createRoot((d) => { effect(() => { bump(); seen.push(c()); }); return d; });
  flush();
  disposeA();
  s.set(2); flush();
  assert.deepEqual(seen, [10], 'no propagation through a disposed computed');
  bump.set(1); flush();
  assert.deepEqual(seen, [10, 20], 'evaluated fresh when read');
  s.set(3); flush();
  assert.deepEqual(seen, [10, 20], 'the read did not re-link');
  disposeB();
});

test('B6.3 step 1: consumers of a disposed owner leave the queue (dirty binding and effect never run)', () => {
  const s = signal('a');
  const log: string[] = [];
  let p!: HTMLElement;
  const dispose = createRoot((d) => {
    p = h.p(null, () => { log.push(`bind ${s()}`); return s(); });
    effect(() => { log.push(`effect ${s()}`); });
    return d;
  });
  flush();
  s.set('b');
  dispose();
  flush();
  assert.deepEqual(log, ['bind a', 'effect a']);
  assert.equal(p.textContent, 'a');
});

test('B6.3/B4.3 a branch disposed during phase (a) drops its dirty bindings', (t) => {
  const on = signal(true), s = signal(0);
  const log: number[] = [];
  mountTest(t, () => h.div(null, show(on, () => h.p(null, () => { log.push(s()); return s(); }))));
  s.set(1); on.set(false); flush();
  assert.deepEqual(log, [0]);
});

test('B6.3 an effect stopped by an earlier effect in the same batch does not run', () => {
  const s = signal(0);
  const log: string[] = [];
  let stopB = () => {};
  const dispose = createRoot((d) => {
    effect(() => { if (s() === 1) stopB(); log.push(`A ${s()}`); });
    stopB = effect(() => { log.push(`B ${s()}`); });
    return d;
  });
  flush();
  s.set(1); flush();
  assert.deepEqual(log, ['A 0', 'B 0', 'A 1']);
  dispose();
});

// ---------------------------------------------------------------- B6.4 effect re-run

test('B6.4 before a re-run the previous run owner is disposed: children, then abort, then its cleanup', () => {
  const s = signal(0), t = signal(0);
  const log: string[] = [];
  const dispose = createRoot((d) => {
    effect(({ abortSignal }) => {
      const v = s();
      abortSignal.addEventListener('abort', () => log.push(`abort ${v}`));
      effect(() => { log.push(`child run ${v}/${t()}`); return () => log.push(`child cleanup ${v}`); });
      createRoot(() => { onMount(() => () => log.push(`root cleanup ${v}`)); });
      log.push(`run ${v}`);
      return () => log.push(`cleanup ${v}`);
    });
    return d;
  });
  flush();
  assert.deepEqual(log, ['run 0', 'child run 0/0']);
  log.length = 0;
  s.set(1); flush();
  assert.deepEqual(log, ['root cleanup 0', 'child cleanup 0', 'abort 0', 'cleanup 0', 'run 1', 'child run 1/0']);
  log.length = 0;
  t.set(1); flush();
  assert.deepEqual(log, ['child cleanup 1', 'child run 1/1'], 'the previous run\'s child effect is gone');
  dispose();
});

test('B6.4 a computed created in a previous run is disposed at the re-run', () => {
  const s = signal(0), k = signal(5);
  const made: (() => number)[] = [];
  let calls = 0;
  const dispose = createRoot((d) => {
    effect(() => { s(); const c = computed(() => { calls++; return k() + 1; }); c(); made.push(c); });
    return d;
  });
  flush();
  s.set(1); flush();
  const before = calls;
  made[0]!(); made[0]!();
  assert.equal(calls, before + 2, 'run 1 computed evaluates uncached');
  dispose();
});

test('B6.4 an onMount registered by an effect run never runs once that run has been replaced', () => {
  const s = signal(0);
  const log: string[] = [];
  const dispose = createRoot((d) => {
    effect(() => { const v = s(); onMount(() => { log.push(`mount ${v}`); }); });
    // created after the effect: runs after its first run in the same phase (b); onMount writes are silent
    onMount(() => { s.set(1); });
    return d;
  });
  flush();
  dispose();
  assert.deepEqual(log, ['mount 1'], 'run 0 was disposed before its onMount job ran');
});

// ---------------------------------------------------------------- B6.5 self-disposal

test('B6.5 an effect that disposes its parent root during its run: abort at once, returned cleanup when it returns', () => {
  const s = signal(0);
  const log: string[] = [];
  createRoot((d) => {
    effect(({ abortSignal }) => {
      const v = s();
      if (v === 1) { d(); log.push(`aborted ${abortSignal.aborted}`); }
      return () => log.push(`cleanup ${v}`);
    });
  });
  flush();
  s.set(1); flush();
  assert.deepEqual(log, ['cleanup 0', 'aborted true', 'cleanup 1']);
  s.set(2); flush();
  assert.deepEqual(log, ['cleanup 0', 'aborted true', 'cleanup 1']);
});

test('B6.5 an owner disposed during its own onMount run aborts at once; the returned cleanup runs once when the run returns', () => {
  const log: string[] = [];
  let disposeRoot!: () => void;
  createRoot((d) => {
    disposeRoot = d;
    onMount(({ abortSignal }) => {
      abortSignal.addEventListener('abort', () => log.push('abort'));
      d();
      log.push(`after dispose aborted=${abortSignal.aborted}`);
      return () => log.push('cleanup');
    });
  });
  flush();
  disposeRoot();
  assert.deepEqual(log, ['abort', 'after dispose aborted=true', 'cleanup']);
});

test('B6.5 stop(), dispose() and unmount() are idempotent: cleanups run once', () => {
  const s = signal(0);
  const log: string[] = [];
  let stop = () => {};
  const dispose = createRoot((d) => { stop = effect(() => { s(); return () => log.push('effect'); }); onMount(() => () => log.push('root')); return d; });
  const target = document.createElement('div');
  const unmount = mount(() => { onMount(() => () => log.push('mount')); return h.p(null, 'x'); }, target);
  flush();
  stop(); stop();
  dispose(); dispose(); stop();
  unmount(); unmount();
  assert.deepEqual(log, ['effect', 'root', 'mount']);
});

test('B6.5 an effect created by an effect after it stopped itself in the same run never runs', () => {
  const cap = capture();
  const log: string[] = [];
  const s = signal(0);
  let stop = () => {};
  const dispose = createRoot((d) => {
    stop = effect(() => { stop(); effect(() => { log.push(`inner ${s()}`); }); });
    return d;
  });
  flush();
  s.set(1); flush();
  dispose();
  cap.stop();
  assert.deepEqual(log, [], 'the child belongs to a disposed run');
});

test('B6.5 an effect created in onMount after its owner was disposed in that run never runs', () => {
  const cap = capture();
  const log: string[] = [];
  const s = signal(0);
  createRoot((d) => {
    onMount(() => { d(); effect(() => { log.push(`inner ${s()}`); }); });
  });
  flush();
  s.set(1); flush();
  cap.stop();
  assert.deepEqual(log, [], 'created under a disposed owner');
});

// ---------------------------------------------------------------- B6.6 disposal and DOM

test('B6.6 regions remove nodes only after disposing the owner: cleanups see their nodes connected', (t) => {
  const on = signal(true), key = signal('a'), list = signal([1]), fail = signal(false);
  const seen: string[] = [];
  const view = mountTest(t, () => h.div(null,
    show(on, () => { const p = h.p(null, 'show'); onMount(() => () => seen.push(`show ${p.isConnected}`)); return p; }),
    match(key, (k) => { const p = h.p(null, k); onMount(() => () => seen.push(`match ${p.isConnected}`)); return p; }),
    h.ul(null, each(list, { key: (x) => x, render: () => { const li = h.li(null, 'row'); onMount(() => () => seen.push(`row ${li.isConnected}`)); return li; } })),
    catchError(() => {
      const p = h.p(null, () => { if (fail()) throw new Error('x'); return 'ok'; });
      onMount(() => () => seen.push(`try ${p.isConnected}`));
      return p;
    }, () => h.p(null, 'fallback')),
  ));
  on.set(false); key.set('b'); list.set([]); fail.set(true); flush();
  assert.deepEqual(seen.sort(), ['match true', 'row true', 'show true', 'try true']);
  assert.equal(view.root.textContent, 'bfallback');
});

test('B6.6 unmount disposes the root before removing nodes; createRoot dispose leaves DOM nodes in place', () => {
  const seen: boolean[] = [];
  const { target, unmount } = host(() => { const p = h.p(null, 'x'); onMount(() => () => seen.push(p.isConnected)); return p; });
  flush();
  unmount();
  assert.deepEqual(seen, [true]);
  const box = document.createElement('div');
  document.body.append(box);
  const dispose = createRoot((d) => { box.append(h.p(null, 'kept')); return d; });
  dispose();
  assert.equal(box.textContent, 'kept');
  box.remove();
  void target;
});

// ---------------------------------------------------------------- B6.7 createRoot

test('B6.7 createRoot is a child of the current owner, runs untracked and returns fn\'s result', () => {
  const s = signal(0), dep = signal(0);
  const log: string[] = [];
  let runs = 0;
  const dispose = createRoot((d) => {
    effect(() => {
      runs++;
      dep();
      const v = createRoot(() => { onMount(() => () => log.push('inner root cleanup')); return s() + 100; });
      log.push(`got ${v}`);
    });
    return d;
  });
  flush();
  s.set(1); flush();
  assert.equal(runs, 1, 'a read inside createRoot is untracked');
  dep.set(1); flush();
  assert.deepEqual(log, ['got 100', 'inner root cleanup', 'got 101']);
  dispose();
  assert.deepEqual(log, ['got 100', 'inner root cleanup', 'got 101', 'inner root cleanup']);
});

test('B6.7 a root created in a branch is disposed with the branch', (t) => {
  const on = signal(true);
  const log: string[] = [];
  mountTest(t, () => h.div(null, show(on, () => { createRoot(() => { onMount(() => () => log.push('root cleanup')); }); return h.p(null, 'x'); })));
  on.set(false); flush();
  assert.deepEqual(log, ['root cleanup']);
});

test('B6.7 a detached root created in a handler is app-lifetime: mountTest neither reports it nor resets it', () => {
  let stop!: () => void;
  let rootSignal!: { (): string; set(v: string): void };
  const outer = signal(0);
  let runs = 0;
  const view = mountTest({ after() {} }, () => h.button({
    onclick: () => { createRoot((d) => { stop = d; rootSignal = signal('initial'); effect(() => { outer(); runs++; }); }); },
  }, 'go'));
  view.root.querySelector('button')!.click();
  flush();
  rootSignal.set('changed');
  outer.set(1); flush();
  assert.equal(runs, 2);
  view.dispose(); // no EFFECT_LEAKED
  assert.equal(rootSignal(), 'changed', 'signals owned by a detached root are not reset');
  assert.equal(outer(), 0, 'signals created outside any owner are reset');
  stop();
});

// ---------------------------------------------------------------- B6.8 NO_OWNER

test('B6.8 effect, onMount, resource and component with no owner report NO_OWNER; createRoot, signal, computed do not', async () => {
  const cap = capture();
  const s = signal(0);
  let runs = 0;
  const stop = effect(() => { s(); runs++; });
  onMount(() => {});
  resource({ loader: async () => null });
  const C = component(function C(): Node { return h.p(null, 'c'); });
  C();
  createRoot(() => {});
  computed(() => s())();
  flush();
  s.set(1); flush();
  assert.equal(runs, 2, 'an ownerless effect lives');
  stop();
  s.set(2); flush();
  assert.equal(runs, 2, 'until stop()');
  await tick();
  cap.stop();
  assert.deepEqual(cap.codes(), ['NO_OWNER', 'NO_OWNER', 'NO_OWNER', 'NO_OWNER']);
});

// ---------------------------------------------------------------- B6.9 onMount

test('B6.9 onMount runs after insertion with its owner current: context works, effects die with the branch, reads are untracked', (t) => {
  const Theme = createContext<string>('Theme');
  const on = signal(true), s = signal(0);
  const log: string[] = [];
  let mounts = 0;
  mountTest(t, () => provide(Theme, 'dark', () => h.div(null, show(on, () => {
    const p = h.p(null, 'x');
    onMount(() => {
      mounts++;
      log.push(`ctx ${useContext(Theme)} connected ${p.isConnected} s ${s()}`);
      effect(() => { const v = s(); log.push(`effect ${v}`); return () => log.push(`effect cleanup ${v}`); });
    });
    return p;
  }))));
  assert.deepEqual(log, ['ctx dark connected true s 0', 'effect 0']);
  s.set(1); flush();
  assert.equal(mounts, 1, 'onMount read s untracked');
  on.set(false); flush();
  s.set(2); flush();
  assert.deepEqual(log, ['ctx dark connected true s 0', 'effect 0', 'effect cleanup 0', 'effect 1', 'effect cleanup 1']);
});

test('B6.9 onMount in rows, branches and fallbacks built during a flush sees its nodes in the document', (t) => {
  const list = signal<number[]>([]), on = signal(false), fail = signal(false);
  const seen: string[] = [];
  mountTest(t, () => h.div(null,
    h.ul(null, each(list, { key: (x) => x, render: () => { const li = h.li(null, 'r'); onMount(() => { seen.push(`row ${li.isConnected}`); }); return li; } })),
    show(on, () => { const p = h.p(null, 's'); onMount(() => { seen.push(`show ${p.isConnected}`); }); return p; }),
    catchError(() => h.p(null, () => { if (fail()) throw new Error('x'); return 'ok'; }),
      () => { const p = h.p(null, 'f'); onMount(() => { seen.push(`fallback ${p.isConnected}`); }); return p; }),
  ));
  list.set([1]); on.set(true); fail.set(true); flush();
  assert.deepEqual(seen.sort(), ['fallback true', 'row true', 'show true']);
});

// ---------------------------------------------------------------- B6.10 no owner in handlers and after await

test('B6.10 handlers and code after await run with no owner', async (t) => {
  const Theme = createContext<string>('Theme');
  const results: string[] = [];
  const view = mountTest(t, () => provide(Theme, 'x', () => {
    onMount(() => {
      results.push(`mount ${useContext(Theme)}`);
      void (async () => {
        await Promise.resolve();
        try { useContext(Theme); results.push('await: owner'); } catch (e) { results.push(`await: ${codeOf(e)}`); }
      })();
    });
    return h.button({ onclick: () => { try { useContext(Theme); results.push('handler: owner'); } catch (e) { results.push(`handler: ${codeOf(e)}`); } } }, 'b');
  }));
  await tick();
  view.root.querySelector('button')!.click();
  assert.deepEqual(results, ['mount x', 'await: CONTEXT_OUTSIDE_OWNER', 'handler: CONTEXT_OUTSIDE_OWNER']);
});

// ---------------------------------------------------------------- B6.11 OWNED_IN_DERIVATION

test('B6.11 effect, onMount, resource, component and createRoot inside computed, untracked-in-computed, bindings and linkedSignal throw OWNED_IN_DERIVATION', () => {
  const makers: Record<string, () => unknown> = {
    effect: () => effect(() => {}),
    onMount: () => onMount(() => {}),
    resource: () => resource({ loader: async () => null }),
    component: () => component(function X(): Node { return h.i(null); })(),
    createRoot: () => createRoot(() => 1),
  };
  const cap = capture();
  for (const [kind, make] of Object.entries(makers)) {
    const is = (e: unknown) => codeOf(e) === 'OWNED_IN_DERIVATION';
    assert.throws(() => computed(() => { make(); return 1; })(), is, `computed/${kind}`);
    assert.throws(() => computed(() => untracked(() => { make(); return 1; }))(), is, `untracked/${kind}`);
    assert.throws(() => createRoot(() => h.p({ title: () => { make(); return 'x'; } })), is, `binding/${kind}`);
    assert.throws(() => createRoot(() => show(() => { make(); return true; }, () => 'x')), is, `show when/${kind}`);
    assert.throws(() => linkedSignal({ source: () => 1, computation: () => { make(); return 1; } })(), is, `linkedSignal/${kind}`);
  }
  cap.stop();
  assert.deepEqual(cap.codes().filter((c) => c !== 'UNTRACKED_IN_DERIVATION'), []);
});

test('B6.11 an effect created in resource params becomes the resource error (OWNED_IN_DERIVATION)', () => {
  let r!: { status(): string; error(): unknown };
  const dispose = createRoot((d) => { r = resource({ params: () => { effect(() => {}); return 1; }, loader: async () => null }) as never; return d; });
  assert.equal(r.status(), 'error');
  assert.equal(codeOf(r.error()), 'OWNED_IN_DERIVATION');
  dispose();
});

test('B6.11 creating an effect in an each key function (a derivation) throws OWNED_IN_DERIVATION', () => {
  const cap = capture();
  const stops: (() => void)[] = [];
  let err: unknown;
  try {
    const u = mount(() => h.ul(null, each(() => [1], {
      key: (x) => { stops.push(effect(() => {})); return x; },
      render: () => h.li(null, 'x'),
    })), document.createElement('div'));
    u();
  } catch (e) { err = e; }
  cap.stop();
  for (const s of stops) s();
  assert.equal(err === undefined ? 'nothing thrown' : codeOf(err), 'OWNED_IN_DERIVATION', `diagnostics: ${cap.codes().join(', ')}`);
});

// ---------------------------------------------------------------- B7 AbortSignal

test('B7.1 an effect run\'s abortSignal is fresh per run, aborted before the next run and on stop', () => {
  const s = signal(0);
  const sigs: AbortSignal[] = [];
  const atStart: boolean[] = [];
  let stop = () => {};
  const dispose = createRoot((d) => {
    stop = effect(({ abortSignal }) => { s(); atStart.push(sigs.map((x) => x.aborted).every(Boolean)); sigs.push(abortSignal); });
    return d;
  });
  flush();
  s.set(1); flush();
  assert.notEqual(sigs[0], sigs[1]);
  assert.deepEqual(atStart, [true, true], 'previous run aborted before this run started');
  assert.equal(sigs[1]!.aborted, false);
  stop();
  assert.equal(sigs[1]!.aborted, true);
  assert.equal((sigs[1]!.reason as DOMException).name, 'AbortError');
  dispose();
});

test('B7.1 the context passed to an effect run keeps that run\'s abortSignal after the next run', () => {
  const s = signal(0);
  const ctxs: Ctx[] = [];
  const dispose = createRoot((d) => { effect((ctx) => { s(); ctxs.push(ctx); }); return d; });
  flush();
  s.set(1); flush();
  assert.equal(ctxs[0]!.abortSignal.aborted, true, 'run 1\'s ctx.abortSignal must be run 1\'s (aborted) signal');
  assert.equal(ctxs[1]!.abortSignal.aborted, false);
  dispose();
});

test('B7.1 async work started by an effect run sees ctx.abortSignal aborted after the effect re-ran', async () => {
  const s = signal(0);
  const gate = deferred<void>();
  const seen: string[] = [];
  const dispose = createRoot((d) => {
    effect((ctx) => {
      const v = s();
      void (async () => { await gate.promise; seen.push(`${v}:${ctx.abortSignal.aborted}`); })();
    });
    return d;
  });
  flush();
  s.set(1); flush();
  gate.resolve();
  await tick();
  dispose();
  assert.deepEqual(seen, ['0:true', '1:false']);
});

test('B7.1 onMount\'s abortSignal belongs to its owner: shared by the owner\'s onMounts, aborted on disposal, pre-aborted after', (t) => {
  const on = signal(true);
  const sigs: AbortSignal[] = [];
  let late: AbortSignal | undefined;
  let keep: Ctx | undefined;
  mountTest(t, () => h.div(null, show(on, () => {
    onMount(({ abortSignal }) => { sigs.push(abortSignal); });
    onMount((ctx) => { sigs.push(ctx.abortSignal); keep = ctx; });
    return h.p(null, 'x');
  })));
  assert.equal(sigs[0], sigs[1]);
  assert.equal(sigs[0]!.aborted, false);
  on.set(false); flush();
  assert.equal(sigs[0]!.aborted, true);
  assert.equal((sigs[0]!.reason as DOMException).name, 'AbortError');
  late = keep!.abortSignal;
  assert.equal(late.aborted, true, 'accessed after disposal: already aborted');
});

test('B7.2 a resource loader abortSignal aborts on params change, reload(), set() and disposal (AbortError reasons)', async () => {
  const cap = capture();
  const id = signal(1);
  const sigs: AbortSignal[] = [];
  let r!: { reload(): void; set(v: unknown): void; status(): string };
  const dispose = createRoot((d) => {
    r = resource({ params: () => id(), loader: ({ abortSignal }) => { sigs.push(abortSignal); return hang(abortSignal); } }) as never;
    return d;
  });
  assert.equal(sigs.length, 1);
  id.set(2); flush();
  assert.equal(sigs.length, 2);
  assert.equal(sigs[0]!.aborted, true, 'params change');
  r.reload(); flush();
  assert.equal(sigs.length, 3);
  assert.equal(sigs[1]!.aborted, true, 'reload()');
  r.set('local');
  assert.equal(sigs[2]!.aborted, true, 'set()');
  r.reload(); flush();
  assert.equal(sigs.length, 4);
  dispose();
  assert.equal(sigs[3]!.aborted, true, 'disposal');
  for (const s of sigs) assert.equal((s.reason as DOMException).name, 'AbortError');
  await tick();
  cap.stop();
  assert.deepEqual(cap.errors, []);
});

test('B7.4 a rejection with the loader\'s own AbortError is an error state; a settlement after jasno aborted is ignored', async () => {
  const mine = new DOMException('my timeout', 'AbortError');
  let r!: { status(): string; error(): unknown };
  const first = deferred<string>();
  const id = signal(1);
  let q!: { status(): string; value(): unknown };
  const dispose = createRoot((d) => {
    r = resource({ loader: () => Promise.reject(mine) }) as never;
    q = resource({ params: () => id(), loader: ({ params }) => (params === 1 ? first.promise : Promise.resolve(`v${params}`)) }) as never;
    return d;
  });
  id.set(2); flush();
  first.resolve('stale');
  await tick(); await tick();
  flush();
  assert.equal(r.status(), 'error');
  assert.equal(r.error(), mine);
  assert.equal(q.value(), 'v2');
  dispose();
});

// ---------------------------------------------------------------- B8.1 cached errors

test('B8.1 a throwing computed gives the same error object to every consumer until a source changes', () => {
  const s = signal(1);
  const c = computed(() => { if (s() > 0) throw new Error(`bad ${s()}`); return s(); });
  const got: unknown[] = [];
  const read = () => { try { c(); } catch (e) { got.push(e); } };
  const dispose = createRoot((d) => { effect(read); effect(read); return d; });
  flush();
  read();
  assert.equal(got.length, 3);
  assert.ok(got.every((e) => e === got[0]));
  s.set(2); flush();
  assert.equal(got.length, 5);
  assert.notEqual(got[3], got[0]);
  assert.equal(got[3], got[4]);
  dispose();
});

test('B8.1 an observed throwing linkedSignal rethrows the same object until its source changes', () => {
  const src = signal(1);
  const l = linkedSignal({ source: src, computation: (v: number) => { throw new Error(`l${v}`); } });
  const got: unknown[] = [];
  const dispose = createRoot((d) => { effect(() => { try { l(); } catch (e) { got.push(e); } }); return d; });
  flush();
  try { l(); } catch (e) { got.push(e); }
  assert.equal(got[0], got[1]);
  dispose();
});

// B8.1 (decided 2026-09-26): "same object" holds while the computed is observed; without observers B1.3 applies.
test('B8.1/B1.3 decision: an unobserved throwing computed recomputes on each read; an observed one rethrows the same object', () => {
  const s = signal(1);
  let calls = 0;
  const c = computed(() => { calls++; throw new Error(`x${s()}`); });
  let a: unknown, b: unknown;
  try { c(); } catch (e) { a = e; }
  try { c(); } catch (e) { b = e; }
  assert.notEqual(a, b);
  assert.equal(calls, 2);
  const dispose = createRoot((d) => { effect(() => { try { c(); } catch { /* observed */ } }); return d; });
  flush();
  try { c(); } catch (e) { a = e; }
  try { c(); } catch (e) { b = e; }
  assert.equal(a, b);
  dispose();
});

// ---------------------------------------------------------------- B8.2 synchronous setup errors

test('B8.2 a binding\'s first evaluation is setup: its throw is caught by the catchError on the stack', (t) => {
  const view = mountTest(t, () => h.div(null, catchError(
    () => h.p(null, () => { throw new Error('first eval'); }),
    (e) => h.p(null, `caught ${(e as Error).message}`))));
  assert.equal(view.root.textContent, 'caught first eval');
});

test('B8.2 a fallback that throws during setup goes to the next catchError on the stack', (t) => {
  const view = mountTest(t, () => h.div(null, catchError(
    () => catchError(() => { throw new Error('a'); }, () => { throw new Error('b'); }),
    (e) => h.p(null, `outer ${(e as Error).message}`))));
  assert.equal(view.root.textContent, 'outer b');
});

test('B8.2 mount disposes its root and rethrows: work created before the throw never runs', () => {
  const log: string[] = [];
  const s = signal(0);
  const target = document.createElement('div');
  assert.throws(() => mount(() => {
    effect(() => { log.push(`effect ${s()}`); });
    onMount(() => { log.push('mount'); });
    h.p(null, () => { log.push(`bind ${s()}`); return s(); });
    throw new Error('view');
  }, target), /view/);
  s.set(1); flush();
  assert.deepEqual(log, ['bind 0']);
});

// ---------------------------------------------------------------- B8.3 routing and report()

test('B8.3 later errors go to the nearest catchError up the owner tree (bindings, effects, onMount, cleanups)', (t) => {
  const bad = signal('');
  const view = mountTest(t, () => h.div(null,
    catchError(() => h.p(null, () => { if (bad() === 'bind') throw new Error('bind'); return 'b'; }), (e) => h.i(null, `A:${(e as Error).message}`)),
    catchError(() => { effect(() => { if (bad() === 'effect') throw new Error('effect'); }); return h.p(null, 'e'); }, (e) => h.i(null, `B:${(e as Error).message}`)),
    catchError(() => { effect(() => { const v = bad(); return () => { if (v === 'bind') throw new Error('cleanup'); }; }); return h.p(null, 'c'); }, (e) => h.i(null, `C:${(e as Error).message}`)),
  ));
  bad.set('bind'); flush();
  assert.equal(view.root.textContent, 'A:bindec');
  bad.set('effect'); flush();
  assert.equal(view.root.textContent, 'A:bindB:effectC:cleanup');
});

test('B8.3 an onMount error goes to the nearest catchError', (t) => {
  const on = signal(false);
  const view = mountTest(t, () => h.div(null, catchError(
    () => show(on, () => { onMount(() => { throw new Error('mount'); }); return h.p(null, 'x'); }),
    (e) => h.i(null, (e as Error).message))));
  on.set(true); flush();
  assert.equal(view.root.textContent, 'mount');
});

test('B8.3/B8.8 reading value() of an errored resource in a binding throws at the reader and is routed', async (t) => {
  const failure = new Error('load failed');
  const view = mountTest(t, () => h.div(null, catchError(() => {
    const r = resource({ loader: () => Promise.reject(failure) });
    return h.p(null, () => (r.status() === 'error' ? String(r.value()) : 'loading'));
  }, (e) => h.i(null, e === failure ? 'same error' : 'other'))));
  assert.equal(view.root.textContent, 'loading');
  await settled();
  assert.equal(view.root.textContent, 'same error');
});

test('B8.3 with no region and no recorder, report() calls globalThis.reportError with the original error', () => {
  const saved = hooks.reporter;
  const g = globalThis as { reportError?: (e: unknown) => void };
  const had = Object.getOwnPropertyDescriptor(g, 'reportError');
  const got: unknown[] = [];
  const boom = new Error('unrouted');
  hooks.reporter = undefined;
  g.reportError = (e) => got.push(e);
  let dispose = () => {};
  try {
    dispose = createRoot((d) => { effect(() => { throw boom; }); return d; });
    flush();
  } finally {
    hooks.reporter = saved;
    if (had) Object.defineProperty(g, 'reportError', had); else delete g.reportError;
    dispose();
  }
  assert.deepEqual(got, [boom]);
});

test('B8.3 without reportError, report() rethrows the error in a microtask', () => {
  const saved = hooks.reporter;
  const g = globalThis as { reportError?: unknown; queueMicrotask: (fn: () => void) => void };
  const had = Object.getOwnPropertyDescriptor(g, 'reportError');
  const realQ = g.queueMicrotask;
  const queued: (() => void)[] = [];
  const boom = new Error('unrouted');
  let dispose = () => {};
  hooks.reporter = undefined;
  delete g.reportError;
  try {
    dispose = createRoot((d) => { effect(() => { throw boom; }); return d; });
    g.queueMicrotask = (fn) => { queued.push(fn); };
    flush();
  } finally {
    g.queueMicrotask = realQ;
    hooks.reporter = saved;
    if (had) Object.defineProperty(g, 'reportError', had);
    dispose();
  }
  const thrown = queued.map((fn) => { try { fn(); return undefined; } catch (e) { return e; } });
  assert.ok(thrown.includes(boom), 'a queued microtask throws the original error');
});

// ---------------------------------------------------------------- B8.4 no global halt

test('B8.4 a binding that threw stays subscribed to what it read before throwing; the flush continues', () => {
  const cap = capture();
  const a = signal(0), b = signal(0);
  const log: string[] = [];
  const { target, unmount } = host(() => {
    effect(() => { log.push(`effect ${a()}`); });
    return h.div(null,
      h.p(null, () => { const v = a(); if (v === 1) throw new Error('bad'); return `p${v + b()}`; }),
      h.span(null, () => `s${a()}`));
  });
  flush();
  a.set(1); flush();
  assert.equal((cap.errors[0] as Error).message, 'bad');
  assert.equal(target.textContent, 'p0s1', 'the later binding still ran');
  assert.deepEqual(log, ['effect 0', 'effect 1'], 'effects still ran');
  a.set(2); flush();
  assert.equal(target.textContent, 'p2s2', 'the thrown binding re-ran on its source');
  cap.stop();
  unmount();
});

// ---------------------------------------------------------------- B8.5 catchError

test('B8.5 on an error the try owner is disposed and its nodes removed, then the fallback renders in place', (t) => {
  const fail = signal(false);
  const log: string[] = [];
  let tryNode!: HTMLElement;
  const view = mountTest(t, () => h.div(null, h.b(null, 'A'), catchError(() => {
    tryNode = h.p(null, () => { if (fail()) throw new Error('broken'); return 'ok'; });
    onMount(() => () => log.push(`try cleanup connected=${tryNode.isConnected}`));
    return tryNode;
  }, (e) => { log.push(`fallback sees try node connected=${tryNode.isConnected}`); return h.i(null, (e as Error).message); }), h.b(null, 'Z')));
  fail.set(true); flush();
  assert.deepEqual(log, ['try cleanup connected=true', 'fallback sees try node connected=false']);
  assert.equal(view.root.textContent, 'AbrokenZ');
});

test('B8.5 tryFn and fallback run in child owners of the region: context from above is visible in both', (t) => {
  const Theme = createContext<string>('Theme');
  const fail = signal(false);
  const view = mountTest(t, () => provide(Theme, 'dark', () => h.div(null, catchError(
    () => h.p(null, `try ${useContext(Theme)} `, () => { if (fail()) throw new Error('x'); return ''; }),
    () => h.p(null, `fallback ${useContext(Theme)}`)))));
  assert.equal(view.root.textContent, 'try dark ');
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'fallback dark');
});

test('B8.5 further errors from the disposed subtree in the same flush are dropped', (t) => {
  const fail = signal(false);
  let fallbacks = 0;
  const view = mountTest(t, () => h.div(null, catchError(() => {
    effect(() => { if (fail()) throw new Error('effect'); });
    return h.div(null,
      h.p(null, () => { if (fail()) throw new Error('first'); return 'a'; }),
      h.p(null, () => { if (fail()) throw new Error('second'); return 'b'; }));
  }, (e) => { fallbacks++; return h.i(null, (e as Error).message); })));
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'first');
  assert.equal(fallbacks, 1);
});

test('B8.5 later errors thrown inside the fallback go to the next region up', (t) => {
  const fail = signal(false), fail2 = signal(false);
  const view = mountTest(t, () => h.div(null, catchError(
    () => catchError(
      () => h.p(null, () => { if (fail()) throw new Error('try'); return 'ok'; }),
      () => h.p(null, () => { if (fail2()) throw new Error('fallback'); return 'inner fallback'; })),
    (e) => h.i(null, `outer ${(e as Error).message}`))));
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'inner fallback');
  fail2.set(true); flush();
  assert.equal(view.root.textContent, 'outer fallback');
});

test('B8.5 reset() disposes the fallback and re-runs tryFn from scratch in the next flush, once per flush', (t) => {
  let failing = true;
  let tries = 0;
  const log: string[] = [];
  let resetFn!: () => void;
  const view = mountTest(t, () => h.div(null, h.b(null, 'A'), catchError(() => {
    tries++;
    if (failing) throw new Error(`try ${tries}`);
    return h.p(null, 'ok');
  }, (e, reset) => {
    resetFn = reset;
    onMount(() => () => log.push(`fallback cleanup ${(e as Error).message}`));
    return h.p(null, (e as Error).message);
  }), h.b(null, 'Z')));
  assert.equal(view.root.textContent, 'Atry 1Z');
  resetFn(); resetFn();
  assert.equal(view.root.textContent, 'Atry 1Z', 'not synchronous');
  flush();
  assert.equal(view.root.textContent, 'Atry 2Z');
  assert.equal(tries, 2);
  assert.deepEqual(log, ['fallback cleanup try 1']);
  failing = false;
  resetFn(); flush();
  assert.equal(view.root.textContent, 'AokZ');
  assert.equal(tries, 3);
  assert.deepEqual(log, ['fallback cleanup try 1', 'fallback cleanup try 2']);
});

test('B8.5 focus inside the removed try nodes moves to the first focusable element of the fallback', async () => {
  const cap = capture();
  const fail = signal(false);
  const { target, unmount } = host(() => h.div(null, catchError(
    () => h.div(null, h.button({ 'aria-label': 'Save' }, () => { if (fail()) throw new Error('x'); return 'Save'; })),
    () => h.div(null, h.span(null, 'Failed'), h.button(null, 'Retry')))));
  flush();
  target.querySelector('button')!.focus();
  fail.set(true); flush();
  await Promise.resolve();
  const active = document.activeElement?.textContent;
  cap.stop();
  unmount();
  assert.equal(active, 'Retry');
  assert.deepEqual(cap.codes(), []);
});

test('B8.5 reset() from a focused Retry button moves focus into the rebuilt try content', async () => {
  const cap = capture();
  const fail = signal(true);
  let focusedAfter: Element | null = null;
  const { target, unmount } = host(() => h.div(null, catchError(
    () => h.div(null, h.input({ 'aria-label': 'Name', value: () => { if (fail()) throw new Error('x'); return 'ok'; } })),
    (_e, reset) => h.button({ onclick: () => { fail.set(false); reset(); } }, 'Retry'))));
  flush();
  const retry = target.querySelector('button')!;
  retry.focus();
  retry.click();
  flush();
  await Promise.resolve();
  focusedAfter = document.activeElement;
  const input = target.querySelector('input');
  cap.stop();
  unmount();
  assert.ok(input, 'the try content was rebuilt');
  assert.ok(focusedAfter === input, `focus is on <${focusedAfter?.localName}>, not the rebuilt <input>; diagnostics: ${cap.codes().join(', ')}`);
});

test('B8.5 reset() whose tryFn throws again moves focus from the old Retry to the new fallback', async () => {
  const cap = capture();
  let attempt = 0;
  const { target, unmount } = host(() => h.div(null, catchError(
    () => { attempt++; throw new Error(`fail ${attempt}`); },
    (e, reset) => h.button({ onclick: () => reset() }, `Retry ${(e as Error).message}`))));
  flush();
  target.querySelector('button')!.focus();
  target.querySelector('button')!.click();
  flush();
  await Promise.resolve();
  const active = document.activeElement;
  const text = target.textContent;
  cap.stop();
  unmount();
  assert.equal(text, 'Retry fail 2');
  assert.equal(active?.textContent, 'Retry fail 2', `focus is on <${active?.localName}>; diagnostics: ${cap.codes().join(', ')}`);
});

test('B8.5/B20.3 a catchError swap that removes the focused element restores focus and does not report FOCUS_LOST', async () => {
  const cap = capture();
  const fail = signal(false);
  const { target, unmount } = host(() => h.div(null, catchError(
    () => h.button({ 'aria-label': 'Save' }, () => { if (fail()) throw new Error('x'); return 'Save'; }),
    () => h.p(null, 'Something failed'))));
  flush();
  target.querySelector('button')!.focus();
  fail.set(true); flush();
  await Promise.resolve();
  cap.stop();
  unmount();
  assert.deepEqual(cap.codes(), []);
});

test('B8.5 a cleanup that throws while the boundary disposes its try region is dropped, not sent to the outer region', (t) => {
  const fail = signal(false);
  const view = mountTest(t, () => h.div(null, catchError(
    () => catchError(() => {
      onMount(() => () => { throw new Error('cleanup'); });
      return h.p(null, () => { if (fail()) throw new Error('bind'); return 'ok'; });
    }, (e) => h.p(null, `inner: ${(e as Error).message}`)),
    (e) => h.p(null, `outer: ${(e as Error).message}`))));
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'inner: bind');
});

// ---------------------------------------------------------------- B8.6 handler errors, B8.7 user errors

test('B8.6 event-handler errors are not routed to catchError or report()', () => {
  const cap = capture();
  const boom = new Error('handler');
  const seen: unknown[] = [];
  const onErr = (e: Event) => { seen.push((e as ErrorEvent).error); };
  const realError = console.error;
  console.error = () => {};
  globalThis.addEventListener('error', onErr);
  const { target, unmount } = host(() => h.div(null, catchError(
    () => h.button({ onclick: () => { throw boom; } }, 'x'),
    () => h.p(null, 'fallback'))));
  try {
    target.querySelector('button')!.click();
    flush();
  } finally {
    globalThis.removeEventListener('error', onErr);
    console.error = realError;
  }
  const text = target.textContent;
  cap.stop();
  unmount();
  assert.equal(text, 'x');
  assert.deepEqual(cap.errors, []);
  assert.deepEqual(seen, [boom], 'propagated like a DOM listener error');
});

test('B8.7 jasno never adds properties to user errors or thrown non-errors', (t) => {
  const cap = capture();
  const err = new Error('user');
  const frozen = Object.freeze({ reason: 'frozen' });
  const before = Object.getOwnPropertyNames(err).sort();
  const which = signal(0);
  const dispose = createRoot((d) => {
    effect(() => { const w = which(); if (w === 1) throw err; if (w === 2) throw frozen; if (w === 3) throw 'text'; });
    return d;
  });
  flush();
  which.set(1); flush();
  which.set(2); flush();
  which.set(3); flush();
  dispose();
  cap.stop();
  assert.deepEqual(cap.errors, [err, frozen, 'text']);
  assert.deepEqual(Object.getOwnPropertyNames(err).sort(), before);
  assert.equal(Object.getOwnPropertySymbols(err).length, 0);
  // and through a boundary
  const fail = signal(false);
  let caught: unknown;
  mountTest(t, () => h.div(null, catchError(() => h.p(null, () => { if (fail()) throw err; return 'ok'; }), (e) => { caught = e; return 'f'; })));
  fail.set(true); flush();
  assert.equal(caught, err);
  assert.deepEqual(Object.getOwnPropertyNames(err).sort(), before);
});

// ---------------------------------------------------------------- B8.9 region guards

test('B8.9 a throwing show builder: partial owner disposed (no effect/onMount runs, loader aborted), no nodes inserted, error routed', () => {
  const cap = capture();
  const on = signal(false);
  const log: string[] = [];
  let loaderSignal: AbortSignal | undefined;
  const boom = new Error('builder');
  const { target, unmount } = host(() => h.div(null, show(on, () => {
    effect(() => { log.push('effect'); });
    onMount(() => { log.push('mount'); });
    resource({ loader: ({ abortSignal }) => { loaderSignal = abortSignal; return hang(abortSignal); } });
    h.p(null, 'partial');
    throw boom;
  }, () => h.i(null, 'off'))));
  flush();
  on.set(true); flush();
  cap.stop();
  assert.deepEqual(cap.errors, [boom]);
  assert.equal(target.textContent, '', 'old branch removed, nothing inserted');
  assert.deepEqual(log, []);
  assert.equal(loaderSignal?.aborted, true);
  unmount();
});

test('B8.9 a throwing match builder: nothing inserted, error routed, later keys build normally', () => {
  const cap = capture();
  const key = signal('a');
  const { target, unmount } = host(() => h.div(null, match(key, (k) => { if (k === 'bad') { h.b(null, 'partial'); throw new Error('bad key'); } return h.p(null, k); })));
  key.set('bad'); flush();
  assert.equal(target.textContent, '');
  assert.equal((cap.errors[0] as Error).message, 'bad key');
  key.set('c'); flush();
  assert.equal(target.textContent, 'c');
  cap.stop();
  unmount();
});

test('B8.9 a throwing each row: its partial owner is disposed and the row is retried on the next update', () => {
  const cap = capture();
  const list = signal([1, 2, 3]);
  let bad = true;
  const log: string[] = [];
  const { target, unmount } = host(() => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => {
      onMount(() => { log.push(`mount ${k}`); });
      if (bad && k === 4) throw new Error('row 4');
      return h.li(null, String(k));
    },
  })));
  flush();
  list.set([4, 3, 2, 1]); flush();
  assert.equal(target.textContent, '321');
  assert.equal((cap.errors[0] as Error).message, 'row 4');
  bad = false;
  list.set([1, 2, 3, 4]); flush();
  assert.equal(target.textContent, '1234');
  assert.deepEqual(log, ['mount 1', 'mount 2', 'mount 3', 'mount 4']);
  cap.stop();
  unmount();
});

test('B8.9 a throwing fallback: partial owner disposed, its nodes not inserted, error goes to the next region', (t) => {
  const fail = signal(false);
  const log: string[] = [];
  const view = mountTest(t, () => h.div(null, catchError(
    () => catchError(
      () => h.p(null, () => { if (fail()) throw new Error('try'); return 'ok'; }),
      () => { onMount(() => { log.push('fallback mount'); }); h.b(null, 'partial'); throw new Error('fallback'); }),
    (e) => h.i(null, `outer ${(e as Error).message}`))));
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'outer fallback');
  assert.deepEqual(log, []);
});

// ---------------------------------------------------------------- more edges

test('B6.3/B6.4 a previous run\'s cleanup that throws is reported and the re-run still happens', () => {
  const cap = capture();
  const s = signal(0);
  const runs: number[] = [];
  const dispose = createRoot((d) => {
    effect(() => { const v = s(); runs.push(v); return () => { if (v === 0) throw new Error('cleanup 0'); }; });
    return d;
  });
  flush();
  s.set(1); flush();
  cap.stop();
  assert.deepEqual(runs, [0, 1]);
  assert.equal((cap.errors[0] as Error).message, 'cleanup 0');
  dispose();
});

test('B8.4 an effect that threw stays subscribed to what it read before throwing', () => {
  const cap = capture();
  const a = signal(0), b = signal(0);
  const runs: string[] = [];
  const dispose = createRoot((d) => {
    effect(() => { const v = a(); runs.push(`a${v}`); if (v === 1) throw new Error('bad'); b(); });
    return d;
  });
  flush();
  a.set(1); flush();
  b.set(1); flush(); // not read in the throwing run
  a.set(2); flush();
  cap.stop();
  assert.deepEqual(runs, ['a0', 'a1', 'a2']);
  assert.equal(cap.errors.length, 1);
  dispose();
});

test('B8.9/B8.2 a show builder that throws at creation is caught by the catchError on the stack', (t) => {
  const log: string[] = [];
  const view = mountTest(t, () => h.div(null, catchError(
    () => h.div(null, show(() => true, () => { onMount(() => { log.push('mount'); }); throw new Error('at creation'); })),
    (e) => h.p(null, (e as Error).message))));
  assert.equal(view.root.textContent, 'at creation');
  assert.deepEqual(log, []);
});

test('B6.7 dispose() called inside createRoot\'s fn ends the root before its work runs', () => {
  const log: string[] = [];
  const s = signal(0);
  const result = createRoot((d) => { effect(() => { log.push(`effect ${s()}`); }); onMount(() => { log.push('mount'); }); d(); return 'done'; });
  flush();
  assert.equal(result, 'done');
  assert.deepEqual(log, []);
});

test('B6.3 a disposed owner drops its references to children, cleanups and context values', async () => {
  const { currentOwner } = await import('../../src/core.ts');
  const Ctx = createContext<number>('Ctx');
  let root: any, scope: any;
  const dispose = createRoot((d) => {
    root = currentOwner();
    provide(Ctx, 1, () => { scope = currentOwner(); onMount(() => () => {}); createRoot(() => {}); return h.i(null); });
    return d;
  });
  flush();
  dispose();
  assert.equal(root.children, undefined);
  assert.equal(scope.children, undefined);
  assert.equal(scope.cleanups, undefined);
  assert.equal(scope.ctx, undefined);
});
