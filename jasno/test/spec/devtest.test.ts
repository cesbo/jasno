// Spec conformance: B12 strict-read region, B19 jasno/testing, B20 focus loss, (c) runtime/testing catalogue rows, (d) __JASNO__.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  catchError, component, computed, createContext, createRoot, css, each, effect, flush, h, linkedSignal, match, mount,
  onMount, provide, resource, selector, show, signal, svg, untracked, useContext,
} from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { capture, codeOf, deferred, tick } from '../helpers.ts';

type D = { code: string; severity: string; message: string; hint: string; docs: string; ownerPath: string; node?: string | undefined; loc?: string | undefined; count: number };

const fakeT = () => ({ after(_fn: () => void) {} });
const errorsOf = (fn: () => void): unknown[] => {
  try { fn(); } catch (e) { return e instanceof AggregateError ? [...e.errors] : [e]; }
  return [];
};
const regionOf = (d: D) => /read directly in (.+?); /.exec(d.message)?.[1];
const strict = (c: { diags: D[] }) => c.diags.filter((d) => d.code === 'STRICT_READ_UNTRACKED');
const J = () => (globalThis as unknown as { __JASNO__: any }).__JASNO__;

function inBody(): HTMLDivElement {
  const d = document.createElement('div');
  document.body.append(d);
  return d;
}

// ---------------------------------------------------------------- module-level state for B19.2 / B19.5

const modCount = signal(0, { debugName: 'modCount' });
const modObj = { v: 1 };
const modRef = signal(modObj, { debugName: 'modRef' });
const modSource = signal(1, { debugName: 'modSource' });
const modLinked = linkedSignal({ source: modSource, computation: (s: number) => s * 10, debugName: 'modLinked' });
const rootOwned = createRoot(() => signal(0, { debugName: 'rootOwned' }));

// An effect owned by a module-level root (created at import, so not by any test).
const modTrigger = createRoot(() => signal(0, { debugName: 'modTrigger' }));
createRoot(() => {
  effect(() => { if (modTrigger() === 1) modTrigger.set(2); }, { debugName: 'modEffect' });
});
// A binding owned by a module-level root that will lose its tracked reads.
const modMode = createRoot(() => signal('live', { debugName: 'modMode' }));
const modX = createRoot(() => signal(0, { debugName: 'modX' }));
createRoot(() => h.p(null, () => (untracked(modMode) === 'dead' ? String(untracked(modX)) : modMode())));
// A show() in a module-level root whose branch reads in setup when it is built during a test.
const modOpen = createRoot(() => signal(false, { debugName: 'modOpen' }));
const modRead = createRoot(() => signal(0, { debugName: 'modRead' }));
createRoot(() => h.div(null, show(modOpen, () => h.i(null, String(modRead())))));

// ================================================================ B12 strict-read region

test('B12.1 region labels: <mount>, <Name>, <Name> › show/match/each row/catchError, nested builders and <Anonymous>', () => {
  const cap = capture();
  const s = signal(1, { debugName: 'b121' });
  const Child = component(function Child(): Node { s(); return h.i(null); });
  const Anon = component((() => () => { s(); return h.i(null); })());
  const App = component(function App(): Node {
    return h.div(null,
      show(() => true, () => { s(); return show(() => true, () => { s(); return 'n'; }); }),
      match(() => 1, () => { s(); return 'y'; }),
      each(() => [1], { key: (x) => x, render: () => { s(); return 'z'; } }),
      catchError(() => { s(); return 'w'; }, () => 'f'),
      catchError(() => { throw new Error('x'); }, () => { s(); return 'fallback'; }),
      Child(),
      Anon(),
    );
  });
  const un = mount(() => { s(); return App(); }, document.createElement('div'));
  cap.stop();
  un();
  assert.deepEqual(strict(cap).map(regionOf).sort(), [
    '<Anonymous>', '<App> › catchError', '<App> › catchError', '<App> › each row', '<App> › match', '<App> › show', '<App> › show',
    '<Child>', '<mount>',
  ].sort());
});

test('B12.2 the label is cleared inside untracked, handlers, onMount, key functions, bindings and computeds, and restored afterwards', () => {
  const cap = capture();
  const a = signal(1, { debugName: 'b122a' });
  const k = signal(0, { debugName: 'b122k' });
  const after = signal(0, { debugName: 'b122after' });
  const afterChild = signal(0, { debugName: 'b122afterChild' });
  const afterShow = signal(0, { debugName: 'b122afterShow' });
  const c = computed(() => a() + 1, { debugName: 'b122c' });
  const Child = component(function Child(): Node { return h.i(null); });
  const Comp = component(function Comp(): Node {
    untracked(a);
    untracked(() => a() + c());
    const btn = h.button({ onclick: () => { a(); } }, 'go');
    btn.click();
    onMount(() => { a(); c(); });
    const list = each(() => [1, 2], { key: (x) => x + k(), render: (x) => h.i(null, () => String(x())) });
    const p = h.p({ title: () => String(a()) }, () => c());
    after();
    Child();
    afterChild();
    const sh = show(() => true, () => 'x');
    afterShow();
    return h.div(null, btn, list, p, sh);
  });
  const un = mount(() => Comp(), document.createElement('div'));
  flush();
  cap.stop();
  un();
  assert.deepEqual(strict(cap).map((d) => `${d.node}@${regionOf(d)}`).sort(),
    ['b122after@<Comp>', 'b122afterChild@<Comp>', 'b122afterShow@<Comp>']);
  assert.deepEqual(cap.codes().filter((x) => x !== 'STRICT_READ_UNTRACKED'), []);
});

test('B12.3/B12.4 a synchronous loader read reports LOADER_READ_UNTRACKED; untracked and after-await reads are silent; loaders are not setup', async () => {
  const cap = capture();
  const q = signal('a', { debugName: 'b123q' });
  const late = signal(0, { debugName: 'b123late' });
  const quiet = signal(0, { debugName: 'b123quiet' });
  const cq = computed(() => q() + '!', { debugName: 'b123cq' });
  let r: any;
  const un = mount(() => {
    r = resource({
      debugName: 'b123users',
      loader: async () => { q(); cq(); untracked(quiet); clearTimeout(setTimeout(() => {}, 0)); await null; late(); return 1; },
    });
    return h.p(null);
  }, document.createElement('div'));
  await tick();
  r.reload();
  flush();
  await tick();
  cap.stop();
  un();
  const loader = cap.diags.filter((d) => d.code === 'LOADER_READ_UNTRACKED');
  assert.deepEqual(loader.map((d) => d.node).sort(), ['b123cq', 'b123q']);
  assert.match(loader[0]!.message, /read in the loader of resource "b123users"; changing it will not reload\./);
  assert.equal(loader.find((d) => d.node === 'b123q')!.count, 2, 'deduplicated across the reload');
  assert.deepEqual(cap.codes().filter((x) => x !== 'LOADER_READ_UNTRACKED'), [], 'no STRICT_READ_UNTRACKED or LEAK_IN_SETUP in a loader');
});

test('B12.4 a computed read in setup is reported once for the computed (not for its sources), with owner path and user frame', () => {
  const cap = capture();
  const a = signal(1, { debugName: 'b124a' });
  const b = signal(2, { debugName: 'b124b' });
  const sum = computed(() => a() + b(), { debugName: 'b124sum' });
  const Inner = component(function Inner(): Node { return h.p(null, String(sum())); });
  const Outer = component(function Outer(): Node { return h.div(null, Inner()); });
  const un = mount(() => Outer(), document.createElement('div'));
  cap.stop();
  un();
  const list = strict(cap);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.node, 'b124sum');
  assert.equal(list[0]!.ownerPath, '<Outer> › <Inner>');
  assert.equal(regionOf(list[0]!), '<Inner>');
  assert.match(list[0]!.loc ?? '', /test\/spec\/devtest\.test\.ts:\d+:\d+$/);
  assert.equal(list[0]!.severity, 'warn');
});

test('B12.4 resource fields in setup: value() idle/loading throws PENDING_READ_UNTRACKED, resolved warns, untracked is silent', async () => {
  const d = deferred<number>();
  let r: any;
  const dispose = createRoot((dispose) => { r = resource({ debugName: 'b124r', loader: () => d.promise }); return dispose; });
  const idle = createRoot((dispose) => ({ dispose, r: resource({ debugName: 'b124idle', params: () => undefined, loader: async () => 1 }) }));
  const cap = capture();
  const Loading = component(function Loading(): Node { return h.p(null, String(r.value())); });
  assert.throws(() => mount(() => Loading(), document.createElement('div')), (e) => codeOf(e) === 'PENDING_READ_UNTRACKED');
  const Idle = component(function Idle(): Node { return h.p(null, String(idle.r.value())); });
  assert.throws(() => mount(() => Idle(), document.createElement('div')), (e) => codeOf(e) === 'PENDING_READ_UNTRACKED' && /while idle/.test((e as Error).message));
  const Quiet = component(function Quiet(): Node { return h.p(null, String(untracked(() => r.value()))); });
  mount(() => Quiet(), document.createElement('div'))();
  d.resolve(7);
  await tick();
  const Resolved = component(function Resolved(): Node { return h.p(null, String(r.value()), String(r.status()), String(r.hasValue())); });
  const un = mount(() => Resolved(), document.createElement('div'));
  cap.stop();
  un();
  dispose();
  idle.dispose();
  assert.deepEqual(strict(cap).map((x) => x.node).sort(), ['b124r.hasValue', 'b124r.status', 'b124r.value']);
  assert.equal(cap.diags.length, 3);
});

test('B12.5 deduplication: one event per (code, region, node, call site); repeats increment count', () => {
  const cap = capture();
  const shared = signal(0, { debugName: 'b125shared' });
  const s1 = signal(0, { debugName: 'b125s1' });
  const s2 = signal(0, { debugName: 'b125s2' });
  const helper = signal(0, { debugName: 'b125helper' });
  const readHelper = () => helper();
  const Reader = component(function Reader(): Node { return h.p(null, String(shared())); });
  const A = component(function A(): Node { readHelper(); return h.i(null); });
  const B = component(function B(): Node { readHelper(); return h.i(null); });
  const Two = component(function Two(): Node { shared(); shared(); [s1, s2].forEach((s) => s()); return h.i(null); });
  const un = mount(() => h.div(null, Reader(), Reader(), Reader(), A(), A(), B(), Two()), document.createElement('div'));
  cap.stop();
  un();
  const byKey = strict(cap).map((d) => `${d.node}@${regionOf(d)}x${d.count}`).sort();
  assert.deepEqual(byKey, [
    'b125helper@<A>x2', 'b125helper@<B>x1',
    'b125s1@<Two>x1', 'b125s2@<Two>x1',
    'b125shared@<Reader>x3', 'b125shared@<Two>x1', 'b125shared@<Two>x1',
  ]);
});

test('B12.6 UNTRACKED_IN_DERIVATION: computeds and bindings that read only through untracked(); effects and mixed reads are not reported', () => {
  const cap = capture();
  const a = signal(1, { debugName: 'b126a' });
  const b = signal(2, { debugName: 'b126b' });
  const only = computed(() => untracked(a), { debugName: 'b126only' });
  const mixed = computed(() => untracked(a) + b(), { debugName: 'b126mixed' });
  const inner = computed(() => b() * 2, { debugName: 'b126inner' });
  const viaInner = computed(() => untracked(a) + inner(), { debugName: 'b126viaInner' });
  const linked = linkedSignal({ source: b, computation: (s: number) => s + untracked(a), debugName: 'b126linked' });
  const un = mount(() => {
    const seed = untracked(a);
    effect(() => { only(); mixed(); viaInner(); linked(); }, { debugName: 'b126reader' });
    effect(() => { untracked(a); }, { debugName: 'b126effect' });
    return h.p({ title: () => String(untracked(a)) }, String(seed), () => String(mixed()));
  }, document.createElement('div'));
  flush();
  cap.stop();
  un();
  const u = cap.diags.filter((d) => d.code === 'UNTRACKED_IN_DERIVATION');
  assert.equal(u.length, 2, u.map((d) => d.message).join(' | '));
  assert.ok(u.some((d) => d.node === 'b126only'));
  assert.ok(u.some((d) => /^\[UNTRACKED_IN_DERIVATION\] binding /.test(d.message)));
  assert.deepEqual(cap.codes().filter((x) => x !== 'UNTRACKED_IN_DERIVATION'), ['EFFECT_NO_DEPS']);
});

test('B12.6 a binding reported on the run where it lost its last tracked read', () => {
  const cap = capture();
  const mode = signal('live', { debugName: 'b126mode' });
  const x = signal(0);
  const un = mount(() => h.p(null, () => (untracked(mode) === 'dead' ? String(untracked(x)) : mode())), document.createElement('div'));
  assert.deepEqual(cap.codes(), []);
  mode.set('dead');
  flush();
  cap.stop();
  un();
  assert.deepEqual(cap.codes(), ['UNTRACKED_IN_DERIVATION']);
});

test('B12.7 a child reading its own Read props in its body: child region, owner path shows the parent', () => {
  const cap = capture();
  const count = signal(1, { debugName: 'b127count' });
  const Child = component(function Child(p: { n: () => number; label: () => string }): Node { return h.p(null, `${p.n()} ${p.label()}`); });
  const Parent = component(function Parent(): Node { return h.div(null, Child({ n: count, label: () => `#${count()}` })); });
  const un = mount(() => Parent(), document.createElement('div'));
  cap.stop();
  un();
  const list = strict(cap);
  assert.equal(list.length, 2);
  for (const d of list) {
    assert.equal(d.node, 'b127count');
    assert.equal(regionOf(d), '<Child>');
    assert.equal(d.ownerPath, '<Parent> › <Child>');
  }
});

test('B12.8 LEAK_IN_SETUP: timers and window/document listeners without signal in setup; elements, { signal } and non-setup code are silent', () => {
  const cap = capture();
  const ac = new AbortController();
  const fn = () => {};
  let el!: HTMLElement;
  const Leaky = component(function Leaky(): Node {
    clearTimeout(setTimeout(fn, 1000));
    clearInterval(setInterval(fn, 1000));
    window.addEventListener('resize', fn);
    document.addEventListener('keydown', fn);
    matchMedia('(min-width: 1px)').addEventListener('change', fn);
    el = h.div(null);
    el.addEventListener('click', fn);
    onMount(() => { clearTimeout(setTimeout(fn, 1)); window.addEventListener('blur', fn, { once: true }); });
    effect(() => { el.id = 'x'; clearTimeout(setTimeout(fn, 1)); });
    untracked(() => void 0);
    return h.button({ onclick: () => { clearTimeout(setTimeout(fn, 1)); } }, el, 'b');
  });
  const un = mount(() => Leaky(), document.createElement('div'));
  flush();
  (el.parentElement as HTMLButtonElement).click();
  cap.stop();
  un();
  window.removeEventListener('resize', fn);
  document.removeEventListener('keydown', fn);
  ac.abort();
  const leaks = cap.diags.filter((d) => d.code === 'LEAK_IN_SETUP').map((d) => d.node).sort();
  assert.deepEqual(leaks, ["addEventListener('change')", "addEventListener('keydown')", "addEventListener('resize')", 'setInterval()', 'setTimeout()']);
  const one = cap.diags.find((d) => d.code === 'LEAK_IN_SETUP')!;
  assert.match(one.message, /^\[LEAK_IN_SETUP\] .+ was called during setup of <Leaky>; it outlives the component\./);
  assert.deepEqual(cap.codes().filter((c) => c !== 'LEAK_IN_SETUP' && c !== 'EFFECT_NO_DEPS'), []);
});

test('B12.8: addEventListener with a signal option in setup is not reported', () => {
  const cap = capture();
  const ac = new AbortController();
  const fn = () => {};
  const Guarded = component(function Guarded(): Node {
    window.addEventListener('scroll', fn, { signal: ac.signal });
    onMount(() => () => ac.abort());
    return h.i(null);
  });
  const un = mount(() => Guarded(), document.createElement('div'));
  cap.stop();
  un();
  ac.abort();
  assert.deepEqual(cap.diags.map((d) => `${d.code} ${d.node}`), [], 'B12.8: only listeners "without a signal option" are reported');
});

test('B12.8: LEAK_IN_SETUP covers channels (BroadcastChannel, MessagePort) in the Node test environment', () => {
  const cap = capture();
  const fn = () => {};
  const bc = new BroadcastChannel('b128');
  const mc = new MessageChannel();
  const Subs = component(function Subs(): Node {
    bc.addEventListener('message', fn);
    mc.port1.addEventListener('message', fn);
    return h.i(null);
  });
  const un = mount(() => Subs(), document.createElement('div'));
  cap.stop();
  un();
  bc.close();
  mc.port1.close();
  const leaks = cap.diags.filter((d) => d.code === 'LEAK_IN_SETUP').map((d) => d.message);
  assert.equal(leaks.length, 2, `got: ${leaks.join(' | ') || 'none'}`);
});

test('B12.8/ADR-24 false-positive hunt: building every HTML element with typical props in setup reports nothing', () => {
  const cap = capture();
  const tags = ['a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'button', 'canvas',
    'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em',
    'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'header', 'hr', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
    'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option',
    'output', 'p', 'picture', 'pre', 'progress', 'q', 's', 'samp', 'search', 'section', 'select', 'slot', 'small', 'source', 'span',
    'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'u',
    'ul', 'var', 'video', 'wbr'];
  const open = signal(true);
  const All = component(function All(): Node {
    const nodes: Node[] = tags.map((t) => (h as any)[t]({ title: t }, t === 'br' || t === 'wbr' || t === 'hr' ? undefined : 'x'));
    nodes.push(
      h.img({ src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'x' }),
      h.video({ src: 'movie.mp4', autoplay: true, muted: true }),
      h.audio({ src: 'a.mp3' }),
      h.details({ open }, h.summary(null, 's')),
      h.dialog({ open } as never, 'd'),
      h.input({ type: 'checkbox', checked: open, 'aria-label': 'c' }),
      h.input({ autofocus: true, value: 'v', 'aria-label': 'v' }),
      h.select({ value: 'b', 'aria-label': 's' }, h.option({ value: 'a' }, 'a'), h.option({ value: 'b' }, 'b')),
      h.textarea({ value: 't', 'aria-label': 't' }),
      h.form({ onsubmit: (e: Event) => e.preventDefault() }, h.button({ type: 'submit' }, 'Save')),
      svg('svg', { viewBox: '0 0 1 1' }, svg('circle', { r: 1 })),
    );
    return h.div(null, ...nodes);
  });
  const un = mount(() => All(), document.createElement('div'));
  open.set(false);
  flush();
  cap.stop();
  un();
  assert.deepEqual(cap.diags.filter((d) => d.code === 'LEAK_IN_SETUP').map((d) => d.message), []);
});

test('B12.9 mounting every built-in with no user reads yields zero diagnostics (updates stay silent too)', async (t) => {
  const on = signal(true);
  const key = signal('a');
  const list = signal([1, 2, 3]);
  const fail = signal(false);
  const id = signal(1);
  const Ctx = createContext<string>('B129Ctx', 'def');
  const sheet = css`.b129 { color: red }`;
  const Row = component(function Row(p: { item: () => number }): Node { return h.li(null, () => String(p.item())); });
  const Leaf = component(function Leaf(): Node { return h.span(null, useContext(Ctx)); });
  const App = component(function App(): Node {
    const r = resource({ params: () => id(), loader: async ({ params }: { params: number }) => params * 2, debugName: 'b129r' });
    const isSel = selector(() => key());
    const local = linkedSignal({ source: () => id(), computation: (s: number) => s });
    const doubled = computed(() => id() * 2);
    effect(() => { document.title = String(doubled()); });
    onMount(() => {});
    createRoot(() => h.span(null));
    return provide(Ctx, 'v', () => h.main(null,
      h.h1(null, 'Title'),
      Leaf(),
      show(on, () => h.p(null, 'on'), () => h.p(null, 'off')),
      match(key, (k) => h.p(null, String(k))),
      h.ul(null, each(list, { key: (x) => x, render: (x) => Row({ item: x }) })),
      catchError(() => h.p(null, () => { if (fail()) throw new Error('x'); return 'ok'; }),
        (_e, reset) => h.button({ onclick: () => { fail.set(false); reset(); } }, 'Retry')),
      show(() => r.hasValue(), () => h.p(null, () => String(r.value()))),
      h.p({ class: { sel: () => isSel('a') } }, () => String(local())),
      svg('svg', { viewBox: '0 0 1 1', 'aria-hidden': 'true' }, svg('rect', { width: () => id() })),
      h.input({ 'aria-label': 'Name', value: () => String(id()) }),
    ));
  });
  const view = mountTest(t, () => App());
  await settled();
  on.set(false); key.set('b'); list.set([3, 1, 4]); id.set(2);
  await settled();
  fail.set(true);
  await settled();
  view.root.querySelector('button')!.click();
  await settled();
  assert.ok(sheet);
  assert.deepEqual(view.diagnostics, []);
  assert.match(view.root.textContent ?? '', /Title.*v.*off.*b.*314.*ok.*4.*2/);
});

// ================================================================ B19 jasno/testing

test('B19.1 mountTest: container div in body, fresh root, one flush (onMount and first effect runs), checks on t.after', () => {
  const afters: (() => void)[] = [];
  let mounted = 0, ran = 0;
  const s = signal(0);
  const view = mountTest({ after: (fn) => afters.push(fn) }, () => {
    onMount(() => { mounted++; });
    effect(() => { s(); ran++; });
    return h.p(null, 'hi');
  });
  assert.equal(view.root.parentNode, document.body);
  assert.equal(view.root.localName, 'div');
  assert.equal(view.root.innerHTML, '<p>hi</p>');
  assert.equal(mounted, 1);
  assert.equal(ran, 1);
  assert.equal(afters.length, 1);
  afters[0]!();
  assert.equal(view.root.isConnected, false);
  view.dispose();
  afters[0]!();
});

test('B19.2 a diagnostic from an owner the test did not create is tagged <module root> and still fails the test', () => {
  const view = mountTest(fakeT(), () => h.p(null, 'x'));
  modTrigger.set(1);
  flush();
  const d = view.diagnostics.find((x) => x.code === 'EFFECT_WRITES_STATE');
  assert.ok(d, 'recorded');
  assert.match(d.ownerPath, /^<module root>/);
  assert.throws(() => view.dispose(), (e) => codeOf(e) === 'EFFECT_WRITES_STATE');
});

test('B19.2 UNTRACKED_IN_DERIVATION from a binding owned by a module-level root is tagged <module root>', () => {
  const view = mountTest(fakeT(), () => h.p(null, 'x'));
  modMode.set('dead');
  flush();
  const d = view.diagnostics.find((x) => x.code === 'UNTRACKED_IN_DERIVATION');
  assert.ok(d, 'recorded against the test');
  const errs = errorsOf(() => view.dispose());
  assert.deepEqual(errs.map(codeOf), ['UNTRACKED_IN_DERIVATION'], 'still counts');
  assert.match(d.ownerPath, /^<module root>/);
});

test('B19.2 a branch rebuilt inside a module-level root during the test is tagged <module root>', () => {
  const view = mountTest(fakeT(), () => h.p(null, 'x'));
  modOpen.set(true);
  flush();
  const d = view.diagnostics.find((x) => x.code === 'STRICT_READ_UNTRACKED');
  assert.ok(d, 'recorded against the test');
  assert.deepEqual(errorsOf(() => view.dispose()).map(codeOf), ['STRICT_READ_UNTRACKED'], 'still counts');
  assert.match(d.ownerPath, /^<module root>/);
});

test('B19.3 an effect error during the test fails it as UNCAUGHT_ERROR with the original error as cause and the owner path', async () => {
  const boom = new Error('boom');
  const s = signal(0);
  const Comp = component(function Comp(): Node { effect(() => { if (s() === 1) throw boom; }); return h.p(null, 'x'); });
  const view = mountTest(fakeT(), () => Comp());
  s.set(1);
  await tick();
  const errs = errorsOf(() => view.dispose());
  assert.equal(errs.length, 1);
  const e = errs[0] as Error & { diag: D };
  assert.equal(codeOf(e), 'UNCAUGHT_ERROR');
  assert.equal(e.cause, boom);
  assert.match(e.message, /<Comp>/);
  assert.match(e.message, /threw: boom\./);
});

test('B19.3 UNCAUGHT_ERROR carries the owner path in its Diagnostic (diag.ownerPath)', () => {
  const s = signal(0);
  const Comp = component(function Comp(): Node { effect(() => { if (s() === 1) throw new Error('boom'); }); return h.p(null, 'x'); });
  const view = mountTest(fakeT(), () => Comp());
  s.set(1);
  flush();
  const e = errorsOf(() => view.dispose())[0] as Error & { diag: D };
  assert.equal(codeOf(e), 'UNCAUGHT_ERROR');
  assert.match(e.diag.ownerPath, /<Comp>/);
});

test('B19.3 errors from onMount and from cleanups run by the final unmount are UNCAUGHT_ERROR; a catchError region keeps it quiet', () => {
  const a = new Error('mount'), b = new Error('cleanup');
  const view = mountTest(fakeT(), () => h.div(null,
    component(function M(): Node { onMount(() => { throw a; }); return h.i(null); })(),
    component(function C(): Node { onMount(() => () => { throw b; }); return h.i(null); })(),
  ));
  const errs = errorsOf(() => view.dispose()) as (Error & { cause?: unknown })[];
  assert.deepEqual(errs.map(codeOf), ['UNCAUGHT_ERROR', 'UNCAUGHT_ERROR']);
  assert.deepEqual(errs.map((e) => e.cause), [a, b]);

  const fail = signal(false);
  const ok = mountTest(fakeT(), () => h.div(null, catchError(() => h.p(null, () => { if (fail()) throw new Error('x'); return 'ok'; }), () => 'fallback')));
  fail.set(true);
  flush();
  assert.equal(ok.root.textContent, 'fallback');
  ok.dispose();
});

test('B19.4 several unexpected warnings fail as one AggregateError; a single one is thrown as itself', () => {
  const s = signal(0, { debugName: 'b194s' });
  const view = mountTest(fakeT(), () => h.div({ bogusProp: 1 } as never, String(s())));
  let thrown: unknown;
  try { view.dispose(); } catch (e) { thrown = e; }
  assert.ok(thrown instanceof AggregateError);
  assert.deepEqual(thrown.errors.map(codeOf).sort(), ['STRICT_READ_UNTRACKED', 'UNKNOWN_PROP']);
  const one = mountTest(fakeT(), () => h.div({ bogusProp2: 1 } as never));
  assert.throws(() => one.dispose(), (e) => !(e instanceof AggregateError) && codeOf(e) === 'UNKNOWN_PROP');
});

test('B19.4 expect: a listed code that occurs is accepted; one that never occurs fails with EXPECTED_DIAGNOSTIC_MISSING', () => {
  mountTest(fakeT(), () => h.div({ bogusProp3: 1 } as never), { expect: ['UNKNOWN_PROP'] }).dispose();
  const view = mountTest(fakeT(), () => h.p(null), { expect: ['FOCUS_LOST'] });
  assert.throws(() => view.dispose(), (e) => codeOf(e) === 'EXPECTED_DIAGNOSTIC_MISSING'
    && /^\[EXPECTED_DIAGNOSTIC_MISSING\] Expected diagnostic FOCUS_LOST did not occur\./.test((e as Error).message));
});

test('B19.4 dispose() right after the update that dropped focus still fails with FOCUS_LOST (pilot wizard B2)', () => {
  const on = signal(true);
  const view = mountTest(fakeT(), () => h.div(null, show(on, () => h.button({ type: 'button' }, 'Next'))));
  view.root.querySelector('button')!.focus();
  on.set(false);
  flush();
  assert.throws(() => view.dispose(), (e) => codeOf(e) === 'FOCUS_LOST');
});

test('B19.4 EFFECT_LEAKED counts ownerless effects created after await; stopped effects and detached roots are not counted', async () => {
  const s = signal(0);
  const view = mountTest(fakeT(), () => h.p(null, 'x'));
  await Promise.resolve();
  const stop = effect(() => { s(); });
  const stopped = effect(() => { s(); });
  stopped();
  const errs = errorsOf(() => view.dispose());
  stop();
  const leaked = errs.filter((e) => codeOf(e) === 'EFFECT_LEAKED') as Error[];
  assert.equal(leaked.length, 1);
  assert.match(leaked[0]!.message, /^\[EFFECT_LEAKED\] 1 owners created by this test are alive after unmount: /);
  assert.ok(errs.some((e) => codeOf(e) === 'NO_OWNER'));

  let disposeRoot = () => {};
  const clean = mountTest(fakeT(), () => h.button({
    onclick: () => { createRoot((d) => { disposeRoot = d; effect(() => { s(); }); onMount(() => {}); }); },
  }, 'lazy'));
  clean.root.querySelector('button')!.click();
  flush();
  clean.dispose();
  disposeRoot();
});

test('B19.5 (part 1) module-level signals are written during a test', (t) => {
  mountTest(t, () => h.p(null, () => String(modCount())));
  modCount.set(5);
  modRef.set({ v: 2 });
  rootOwned.set(9);
  flush();
});

test('B19.5 (part 2) the next test sees module-level signals at their initial value (by identity); detached-root signals are not reset', () => {
  assert.equal(modCount(), 0);
  assert.equal(modRef(), modObj);
  assert.equal(rootOwned(), 9);
  rootOwned.set(0);
});

test('B19.5 signals created in the test body and in handlers are reset at dispose, even when the checks fail', () => {
  const body = signal('init');
  let fromHandler: any;
  const view = mountTest(fakeT(), () => h.button({ onclick: () => { fromHandler = signal(1); fromHandler.set(2); } }, String(untracked(body)), h.i({ bogusProp4: 1 } as never)));
  body.set('changed');
  view.root.querySelector('button')!.click();
  assert.throws(() => view.dispose(), (e) => codeOf(e) === 'UNKNOWN_PROP');
  assert.equal(body(), 'init');
  assert.equal(fromHandler(), 1);
});

test('B19.5: a module-level linkedSignal written in a test is reset for the next test', () => {
  const view = mountTest(fakeT(), () => h.p(null, () => String(modLinked())));
  modLinked.set(99);
  flush();
  view.dispose();
  assert.equal(modSource(), 1);
  const leaked = modLinked();
  modLinked.set(10);
  assert.equal(leaked, 10, 'reset to computation(source) = 10');
});

test('B19.6 settled() waits for handler promises and loader chains, then resolves', async (t) => {
  const log: string[] = [];
  const view = mountTest(t, () => {
    const id = signal(0);
    const r = resource({ params: () => (id() ? id() : undefined), debugName: 'b196r', loader: ({ params }: { params: number }) => new Promise<number>((res) => setTimeout(() => res(params * 10), 5)) });
    return h.div(null,
      h.button({ onclick: async () => { await new Promise((res) => setTimeout(res, 5)); id.set(4); log.push('clicked'); } }, 'Go'),
      h.p(null, () => (r.hasValue() ? String(r.value()) : '-')));
  });
  view.root.querySelector('button')!.click();
  await settled();
  assert.deepEqual(log, ['clicked']);
  assert.equal(view.root.querySelector('p')!.textContent, '40');
});

test('B19.6 settled() rejects with recorded unexpected diagnostics; a rejected handler promise is UNCAUGHT_ERROR', async () => {
  const oops = new Error('oops');
  const view = mountTest(fakeT(), () => h.div(null,
    h.button({ onclick: async () => { await null; h.i({ bogusProp5: 1 } as never); } }, 'warn'),
    h.button({ onclick: async () => { await null; throw oops; } }, 'reject')));
  const [warnBtn, rejectBtn] = view.root.querySelectorAll('button');
  warnBtn!.click();
  await assert.rejects(settled(), (e) => codeOf(e) === 'UNKNOWN_PROP');
  rejectBtn!.click();
  await assert.rejects(settled(), (e) => codeOf(e) === 'UNCAUGHT_ERROR' && (e as Error).cause === oops);
  view.dispose();
});

test('B19.6 SETTLE_TIMEOUT names a pending loader by debugName and a pending handler by event type and owner path', async () => {
  const load = deferred<number>();
  const click = deferred<void>();
  const Btn = component(function Btn(): Node { return h.button({ onclick: () => click.promise }, 'Go'); });
  const view = mountTest(fakeT(), () => {
    resource({ debugName: 'b196slow', loader: () => load.promise });
    return h.div(null, Btn());
  });
  view.root.querySelector('button')!.click();
  const start = performance.now();
  await assert.rejects(settled({ timeout: 60 }), (e) => {
    const m = (e as Error).message;
    return codeOf(e) === 'SETTLE_TIMEOUT' && /^\[SETTLE_TIMEOUT\] settled\(\) timed out after 60 ms; pending: /.test(m)
      && m.includes('b196slow') && /click handler in <Btn>/.test(m);
  });
  assert.ok(performance.now() - start < 1000);
  load.resolve(1);
  click.resolve();
  await settled();
  view.dispose();
});

test('B19.6 settled() uses timers captured at import: resolves under mock.timers and times out instead of hanging', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  let done = false;
  const view = mountTest(fakeT(), () => h.div(null,
    h.button({ onclick: async () => { await Promise.resolve(); done = true; } }, 'micro'),
    h.button({ onclick: () => new Promise<void>((r) => setTimeout(r, 1000)) }, 'mocked')));
  const [micro, mocked] = view.root.querySelectorAll('button');
  micro!.click();
  await settled();
  assert.equal(done, true);
  mocked!.click();
  await assert.rejects(settled({ timeout: 50 }), (e) => codeOf(e) === 'SETTLE_TIMEOUT');
  t.mock.timers.tick(1000);
  await settled();
  view.dispose();
});

test('B19.6: settled() does not wait for a loader whose request was superseded or disposed', async () => {
  const first = deferred<number>();
  const id = signal(1);
  let r: any;
  const view = mountTest(fakeT(), () => {
    r = resource({ debugName: 'b196super', params: id, loader: ({ params }: { params: number }) => (params === 1 ? first.promise : Promise.resolve(params)) });
    return h.p(null, () => String(r.hasValue() ? r.value() : '-'));
  });
  id.set(2);
  flush();
  await tick();
  assert.equal(view.root.textContent, '2', 'the current request resolved');
  let error: unknown;
  try { await settled({ timeout: 80 }); } catch (e) { error = e; }
  first.resolve(0);
  await settled();
  view.dispose();
  assert.equal(error, undefined, `settled() rejected: ${(error as Error)?.message}`);
});

test('B19.1: a static view (no effects, no onMount) gets the after-flush checks in mountTest', () => {
  const view = mountTest(fakeT(), () => h.div(null, h.button(null)));
  assert.equal(view.root.querySelector('button')!.isConnected, true);
  assert.throws(() => view.dispose(), (e) => codeOf(e) === 'INTERACTIVE_NO_NAME');
});

// ================================================================ B20 focus loss

async function focusCase(t: { after(fn: () => void): void }, build: (s: { set(v: boolean): void; (): boolean }) => Node, pick: (root: HTMLElement) => HTMLElement, expectLost: boolean) {
  const flag = signal(false, { debugName: 'focusFlag' });
  const view = mountTest(t, () => build(flag), expectLost ? { expect: ['FOCUS_LOST'] } : {});
  const el = pick(view.root);
  el.focus();
  assert.equal(document.activeElement, el);
  flag.set(true);
  flush();
  await tick();
  return { view, lost: view.diagnostics.filter((d) => d.code === 'FOCUS_LOST') };
}

test('B20 false-positive hunt: typing in a focused input that stays visible reports nothing', async (t) => {
  const text = signal('');
  const view = mountTest(t, () => h.div(null,
    h.label(null, 'Name ', h.input({ value: text, oninput: (e: Event) => text.set((e.currentTarget as HTMLInputElement).value) })),
    h.p(null, () => `Hello ${text()}`),
    show(() => text().length > 2, () => h.p(null, 'long'))));
  const input = view.root.querySelector('input')!;
  input.focus();
  for (const v of ['a', 'ab', 'abc', 'abcd']) {
    input.value = v;
    input.dispatchEvent(new Event('input'));
    flush();
    await tick();
  }
  assert.equal(document.activeElement, input);
  assert.deepEqual(view.diagnostics, []);
});

test('B20 false-positive hunt: aria-disabled on the focused button (the recommended fix) reports nothing', async (t) => {
  const { lost } = await focusCase(t, (busy) => h.button({ 'aria-disabled': busy }, 'Save'), (r) => r.querySelector('button')!, false);
  assert.deepEqual(lost, []);
});

test('B20.2 disabling the focused button reports FOCUS_LOST ("disabled") with element and owner path', async (t) => {
  const Form = component(function Form(p: { busy: () => boolean }): Node { return h.button({ disabled: p.busy }, 'Save'); });
  const { lost } = await focusCase(t, (busy) => Form({ busy }), (r) => r.querySelector('button')!, true);
  assert.equal(lost.length, 1);
  assert.match(lost[0]!.message, /^\[FOCUS_LOST\] Focus was on <button> in <Form>, which this update disabled; focus fell to <body>\./);
  assert.equal(lost[0]!.ownerPath, '<Form>');
});

test('B20.2 removing the focused row reports FOCUS_LOST ("removed")', async (t) => {
  const { lost } = await focusCase(t, (gone) => h.ul(null, each(() => (gone() ? [1] : [1, 2]), { key: (x) => x, render: (x) => h.li(null, h.button(null, () => String(x()))) })),
    (r) => r.querySelectorAll('button')[1] as HTMLElement, true);
  assert.match(lost[0]?.message ?? '', /which this update removed/);
});

test('B20.2 making an ancestor inert reports FOCUS_LOST ("made inert")', async (t) => {
  const { lost } = await focusCase(t, (busy) => h.div({ inert: busy }, h.button(null, 'x')), (r) => r.querySelector('button')!, true);
  assert.match(lost[0]?.message ?? '', /which this update made inert/);
});

test('B20.2: hiding the focused button (hidden) reports FOCUS_LOST', async (t) => {
  const { lost } = await focusCase(t, (gone) => h.button({ hidden: gone }, 'x'), (r) => r.querySelector('button')!, true);
  assert.match(lost[0]?.message ?? 'none', /which this update hid/);
});

test('B20.2: disabling the fieldset around the focused button reports FOCUS_LOST', async (t) => {
  const { lost } = await focusCase(t, (busy) => h.fieldset({ disabled: busy }, h.legend(null, 'L'), h.button(null, 'x')), (r) => r.querySelector('button')!, true);
  assert.equal(lost.length, 1);
});

test('B20.2 FOCUS_LOST carries the flush\'s cause', async (t) => {
  const { lost } = await focusCase(t, (gone) => h.div(null, show(() => !gone(), () => h.button(null, 'x'))), (r) => r.querySelector('button')!, true);
  assert.equal(lost.length, 1);
  assert.ok(JSON.stringify(lost[0]).includes('focusFlag'), `no cause in ${JSON.stringify(lost[0])}`);
});

test('B20.2 a replacement focused in onMount (same flush) or right after flush() in the same task is not a loss', async (t) => {
  const { lost } = await focusCase(t, (swap) => h.div(null, show(() => !swap(), () => h.button(null, 'a'), () => {
    const b = h.button(null, 'b');
    onMount(() => b.focus());
    return b;
  })), (r) => r.querySelector('button')!, false);
  assert.deepEqual(lost, []);

  const gone = signal(false);
  const view = mountTest(t, () => h.div(null, show(() => !gone(), () => h.button(null, 'x')), h.button(null, 'stay')));
  const [x, stay] = view.root.querySelectorAll('button');
  (x as HTMLElement).focus();
  gone.set(true);
  flush();
  (stay as HTMLElement).focus();
  await tick();
  assert.deepEqual(view.diagnostics, []);
});

test('B20.3 a keyed move (insertBefore fallback) and a catchError swap with a focusable fallback never report', async (t) => {
  const { lost } = await focusCase(t, (flip) => h.div(null, each(() => (flip() ? [3, 1, 2] : [1, 2, 3]), { key: (x) => x, render: (x) => h.button(null, () => String(x())) })),
    (r) => r.querySelectorAll('button')[2] as HTMLElement, false);
  assert.deepEqual(lost, []);
  const { lost: lost2 } = await focusCase(t, (fail) => h.div(null, catchError(() => h.button(null, () => { if (fail()) throw new Error('x'); return 'ok'; }),
    (_e, reset) => h.button({ onclick: reset }, 'Retry'))), (r) => r.querySelector('button')!, false);
  assert.deepEqual(lost2, []);
  assert.equal((document.activeElement as HTMLElement).textContent, 'Retry');
});

test('B8.5/B20.3: a catchError swap into an element with nothing focusable focuses that element (tabindex -1), no FOCUS_LOST', async () => {
  const cap = capture();
  const fail = signal(false);
  const target = inBody();
  const un = mount(() => h.div(null, catchError(() => h.button(null, () => { if (fail()) throw new Error('x'); return 'ok'; }), () => h.p({ role: 'alert' }, 'Something broke'))), target);
  target.querySelector('button')!.focus();
  fail.set(true);
  flush();
  await tick();
  cap.stop();
  const p = target.querySelector('p')!;
  const focused = document.activeElement === p, tabIndex = p.getAttribute('tabindex');
  un();
  target.remove();
  assert.equal(focused, true);
  assert.equal(tabIndex, '-1');
  assert.deepEqual(cap.codes(), []);
});

test('B8.5/B20.3: a catchError swap into text-only content cannot restore focus and reports FOCUS_LOST with the wrap hint', async () => {
  const cap = capture();
  const fail = signal(false);
  const target = inBody();
  const un = mount(() => h.div(null, catchError(() => h.button(null, () => { if (fail()) throw new Error('x'); return 'ok'; }), () => 'Something broke')), target);
  target.querySelector('button')!.focus();
  fail.set(true);
  flush();
  await tick();
  cap.stop();
  un();
  target.remove();
  assert.deepEqual(cap.codes(), ['FOCUS_LOST']);
  assert.match(cap.diags[0]!.hint, /only text: wrap it in an element/);
});

test('B20.1 focus outside any mounted root is not tracked', async (t) => {
  const outside = document.createElement('button');
  outside.textContent = 'outside';
  document.body.append(outside);
  const n = signal(0);
  const view = mountTest(t, () => h.p(null, () => String(n())));
  outside.focus();
  n.set(1);
  flush();
  outside.remove();
  await tick();
  assert.deepEqual(view.diagnostics, []);
});

// ================================================================ (c) catalogue rows

const spec = readFileSync(new URL('../../../design/design.md', import.meta.url), 'utf8');
function table(from: string, to: string): Map<string, string[]> {
  const s = spec.slice(spec.indexOf(from), spec.indexOf(to));
  const rows = new Map<string, string[]>();
  for (const line of s.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    rows.set(cells[0]!.replace(/`/g, ''), cells);
  }
  return rows;
}
const runtimeRows = table('### Runtime', '### `jasno/testing`');
const testingRows = table('### `jasno/testing`', '### `jasno check`');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function conforms(d: D, opts: { template?: boolean; hint?: boolean } = {}): void {
  const runtime = runtimeRows.get(d.code);
  const row = runtime ?? testingRows.get(d.code);
  assert.ok(row, `catalogue row for ${d.code}`);
  const [, severity] = row;
  const template = runtime ? row[4]! : row[3]!;
  const hint = runtime ? row[5]! : row[4]!;
  assert.equal(d.docs, `node_modules/jasno/errors/${d.code}.md`);
  assert.equal(d.severity, severity!.startsWith('warn') ? 'warn' : 'error');
  if (opts.template !== false) {
    const body = template.replace(/^`|`$/g, '').split(/\{[a-zA-Z]+\}/).map(esc).join('.+?');
    assert.match(d.message, new RegExp(`^\\[${d.code}\\] ${body}(?: \\(.*\\))?$`), `template: ${template}`);
  }
  if (opts.hint !== false) {
    const hintRe = hint.split(/\{[a-zA-Z]+\}/).map(esc).join('.+?');
    assert.match(d.hint, new RegExp(`^${hintRe}$`), `hint: ${hint}`);
  }
}

async function warnOf(code: string, run: () => unknown): Promise<D> {
  const cap = capture();
  try { await run(); await tick(); } finally { cap.stop(); }
  const d = cap.diags.find((x) => x.code === code);
  assert.ok(d, `${code} reported (got ${cap.codes().join(', ') || 'nothing'})`);
  return d as D;
}

async function errorOf(code: string, run: () => unknown): Promise<D> {
  const cap = capture();
  let err: any;
  try { await run(); } catch (e) { err = e; } finally { cap.stop(); }
  assert.equal(codeOf(err), code, String(err));
  assert.equal(err.message, `${err.diag.message} hint: ${err.diag.hint} docs: ${err.diag.docs}`, 'first line self-contained');
  assert.ok(!err.message.includes('\n'));
  return err.diag as D;
}

const detached = () => document.createElement('div');
const withBody = async (view: () => Node, then: (root: HTMLElement) => unknown) => {
  const target = inBody();
  const un = mount(view, target);
  try { await then(target); } finally { un(); target.remove(); }
};

const catalogue: Record<string, () => Promise<D>> = {
  // warn rows
  STRICT_READ_UNTRACKED: () => warnOf('STRICT_READ_UNTRACKED', () => {
    const s = signal(0, { debugName: 'catStrict' });
    mount(() => component(function CatStrict(): Node { return h.p(null, String(s())); })(), detached())();
  }),
  LOADER_READ_UNTRACKED: () => warnOf('LOADER_READ_UNTRACKED', async () => {
    const s = signal(0, { debugName: 'catLoader' });
    const un = mount(() => { resource({ debugName: 'catRes', loader: async () => s() }); return h.p(null); }, detached());
    await tick();
    un();
  }),
  UNTRACKED_IN_DERIVATION: () => warnOf('UNTRACKED_IN_DERIVATION', () => { const a = signal(0); computed(() => untracked(a), { debugName: 'catU' })(); }),
  EFFECT_WRITES_STATE: () => warnOf('EFFECT_WRITES_STATE', () => {
    const un = mount(() => { const a = signal(0); effect(() => { if (a() < 1) a.set(1); }, { debugName: 'catEff' }); return h.p(null); }, detached());
    flush();
    un();
  }),
  EFFECT_NO_DEPS: () => warnOf('EFFECT_NO_DEPS', () => { const un = mount(() => { effect(() => {}); return h.p(null); }, detached()); flush(); un(); }),
  NO_OWNER: () => warnOf('NO_OWNER', () => { effect(() => {})(); }),
  WRITE_IN_SETUP: () => warnOf('WRITE_IN_SETUP', () => { const g = signal(0); mount(() => { g.set(1); return h.p(null); }, detached())(); }),
  LEAK_IN_SETUP: () => warnOf('LEAK_IN_SETUP', () => { mount(() => { clearTimeout(setTimeout(() => {}, 1)); return h.p(null); }, detached())(); }),
  RESOURCE_SET_WHILE_LOADING: () => warnOf('RESOURCE_SET_WHILE_LOADING', () => {
    const d = deferred<number>();
    let r: any;
    const un = mount(() => { r = resource({ debugName: 'catSet', loader: () => d.promise }); return h.p(null); }, detached());
    r.set(1);
    un();
    d.resolve(0);
  }),
  DUPLICATE_KEY: () => warnOf('DUPLICATE_KEY', () => {
    mount(() => h.ul(null, each(() => [1, 1], { key: (x) => x, render: () => h.li(null) })), detached())();
  }),
  UNSTABLE_KEY: () => warnOf('UNSTABLE_KEY', () => {
    mount(() => h.ul(null, each(() => [{}], { key: () => Math.random(), render: () => h.li(null) })), detached())();
  }),
  UNKNOWN_PROP: () => warnOf('UNKNOWN_PROP', () => { h.div({ catBogus: 1 } as never); }),
  NODE_MOVED: () => warnOf('NODE_MOVED', () => { const p = h.p(null); h.div(null, p); h.div(null, p); }),
  NODE_OUTSIDE_REGION: () => warnOf('NODE_OUTSIDE_REGION', () => {
    mount(() => { const p = h.p(null); return h.div(null, show(() => true, () => p)); }, detached())();
  }),
  INTERACTIVE_NO_NAME: () => warnOf('INTERACTIVE_NO_NAME', () => withBody(() => { onMount(() => {}); return h.button(null); }, () => flush())),
  FOCUS_LOST: () => warnOf('FOCUS_LOST', () => {
    const open = signal(true);
    return withBody(() => h.div(null, show(open, () => h.button(null, 'x'))), async (root) => {
      root.querySelector('button')!.focus();
      open.set(false);
      flush();
      await tick();
    });
  }),
  KEY_ACTIVATES_NEW_FOCUS: () => warnOf('KEY_ACTIVATES_NEW_FOCUS', () => {
    const btn = h.button(null, 'next');
    return withBody(() => h.div(null, h.input({ 'aria-label': 'i', onkeydown: () => { btn.focus(); } }), btn), async (root) => {
      const input = root.querySelector('input')!;
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
      await tick();
    });
  }),
  SUBMIT_NOT_PREVENTED: () => warnOf('SUBMIT_NOT_PREVENTED', () => {
    const f = h.form({ onsubmit: () => {} });
    f.dispatchEvent(new Event('submit', { cancelable: true }));
  }),
  // thrown rows
  WRITE_IN_DERIVATION: () => errorOf('WRITE_IN_DERIVATION', () => { const s = signal(0); computed(() => s.set(1))(); }),
  EFFECT_LOOP: () => errorOf('EFFECT_LOOP', () => {
    const un = mount(() => { const a = signal(0); effect(() => { a.set(a() + 1); }); return h.p(null); }, detached());
    try { flush(); } finally { un(); }
  }),
  NO_PROVIDER: () => errorOf('NO_PROVIDER', () => { mount(() => { useContext(createContext('CatCtx')); return h.p(null); }, detached()); }),
  CONTEXT_OUTSIDE_OWNER: () => errorOf('CONTEXT_OUTSIDE_OWNER', () => { useContext(createContext('CatCtx2')); }),
  DUPLICATE_RUNTIME: () => errorOf('DUPLICATE_RUNTIME', () => {
    const g = globalThis as unknown as Record<symbol, unknown>;
    const key = Symbol.for('jasno.runtime');
    const old = g[key];
    g[key] = 'file:///elsewhere/node_modules/jasno/src/dom.ts';
    try { mount(() => h.p(null), detached()); } finally { g[key] = old; }
  }),
  MOUNT_TARGET_MISSING: () => errorOf('MOUNT_TARGET_MISSING', () => { mount(() => h.p(null), null); }),
  FLUSH_REENTRANT: () => errorOf('FLUSH_REENTRANT', () => { computed(() => flush())(); }),
  OWNED_IN_DERIVATION: () => errorOf('OWNED_IN_DERIVATION', () => { computed(() => effect(() => {}))(); }),
  SIGNAL_COERCED: () => errorOf('SIGNAL_COERCED', () => `${signal(0) as unknown as string}`),
  NODE_IN_TEXT_BINDING: () => errorOf('NODE_IN_TEXT_BINDING', () => { h.p(null, () => h.b(null) as unknown as string); }),
  PENDING_READ_UNTRACKED: () => errorOf('PENDING_READ_UNTRACKED', () => {
    const d = deferred<number>();
    try { mount(() => { const r: any = resource({ debugName: 'catPending', loader: () => d.promise }); return h.p(null, String(r.value())); }, detached()); } finally { d.resolve(0); }
  }),
  COMPONENT_RETURN_NOT_NODE: () => errorOf('COMPONENT_RETURN_NOT_NODE', () => {
    mount(() => component(function CatBad(): Node { return 'x' as unknown as Node; })(), detached());
  }),
  // jasno/testing rows
  EFFECT_LEAKED: async () => {
    const view = mountTest(fakeT(), () => h.button({ onclick: () => { effect(() => {}); } }, 'b'));
    view.root.querySelector('button')!.click();
    const e = errorsOf(() => view.dispose()).find((x) => codeOf(x) === 'EFFECT_LEAKED') as { diag: D };
    return e.diag;
  },
  EXPECTED_DIAGNOSTIC_MISSING: () => errorOf('EXPECTED_DIAGNOSTIC_MISSING', () => mountTest(fakeT(), () => h.p(null), { expect: ['FOCUS_LOST'] }).dispose()),
  SETTLE_TIMEOUT: async () => {
    const d = deferred<void>();
    const view = mountTest(fakeT(), () => h.button({ onclick: () => d.promise }, 'b'));
    view.root.querySelector('button')!.click();
    let err: any;
    try { await settled({ timeout: 30 }); } catch (e) { err = e; }
    d.resolve();
    await settled();
    view.dispose();
    return err.diag;
  },
  UNCAUGHT_ERROR: async () => {
    const s = signal(0);
    const view = mountTest(fakeT(), () => { effect(() => { if (s()) throw new Error('x'); }); return h.p(null); });
    s.set(1);
    flush();
    return (errorsOf(() => view.dispose())[0] as { diag: D }).diag;
  },
  TESTING_REQUIRES_DEV_BUILD: () => errorOf('TESTING_REQUIRES_DEV_BUILD', () => import('../../src/testing-requires-dev.ts')),
};

for (const [code, trigger] of Object.entries(catalogue)) {
  const name = `(c) ${code}: severity, message template, hint and docs path match the catalogue`;
  test(name, async () => {
    const d = await trigger();
    conforms(d, { template: code !== 'UNCAUGHT_ERROR', hint: code !== 'UNKNOWN_PROP' });
  });
}

test('(c) every runtime and testing catalogue row outside the router has a trigger in this file', () => {
  const router = new Set(['INVALID_ROUTE_PATTERN', 'ROUTE_SHADOWED', 'OUTLET_ALREADY_ACTIVE', 'ROUTER_NOT_STARTED', 'VIEW_NO_HEADING', 'VIEW_IMPORT_FAILED']);
  const missing = [...runtimeRows.keys(), ...testingRows.keys()].filter((c) => !router.has(c) && !(c in catalogue));
  assert.deepEqual(missing, []);
});

test('(c) console delivery: the first printed line is self-contained ([CODE] message ... hint: ... docs: ...)', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'warn', (m: unknown) => { lines.push(String(m)); });
  const s = signal(0, { debugName: 'consoleFmt' });
  mount(() => component(function ConsoleFmt(): Node { return h.p(null, String(s())); })(), detached())();
  t.mock.restoreAll();
  const out = lines.find((l) => l.includes('consoleFmt'));
  assert.ok(out, 'printed with console.warn');
  assert.match(out.split('\n')[0]!, /^\[STRICT_READ_UNTRACKED\] .+ hint: .+ docs: node_modules\/jasno\/errors\/STRICT_READ_UNTRACKED\.md$/);
});

// ================================================================ (d) window.__JASNO__

test('(d) window.__JASNO__ is present: version, diagnostics, clearDiagnostics, graph, inspect, why, router', () => {
  const j = J();
  assert.equal(typeof j, 'object');
  assert.equal(window, globalThis);
  assert.equal(typeof j.version, 'string');
  for (const k of ['diagnostics', 'clearDiagnostics', 'graph', 'inspect', 'why', 'router']) assert.equal(typeof j[k], 'function', k);
});

test('(d) diagnostics(filter) returns deduplicated events with count; clearDiagnostics() empties it', () => {
  const j = J();
  const cap = capture();
  j.clearDiagnostics();
  const s = signal(0, { debugName: 'jd' });
  const C = component(function JD(): Node { return h.p(null, String(s())); });
  mount(() => h.div(null, C(), C()), detached())();
  cap.stop();
  const list = j.diagnostics({ code: 'STRICT_READ_UNTRACKED' });
  assert.equal(list.length, 1);
  assert.equal(list[0].count, 2);
  assert.equal(list[0].node, 'jd');
  assert.equal(j.diagnostics({ severity: 'error' }).length, 0);
  assert.equal(j.diagnostics({ severity: 'warn' }).length, 1);
  assert.doesNotThrow(() => JSON.stringify(j.diagnostics()));
  j.clearDiagnostics();
  assert.equal(j.diagnostics().length, 0);
});

test('(d) runs counts every run over the node\'s lifetime, across flushes (pilot dashboard B1)', (t) => {
  const j = J();
  const a = signal(0);
  const b = computed(() => a() * 2, { debugName: 'jr_b' });
  mountTest(t, () => {
    effect(() => { b(); }, { debugName: 'jr_eff' });
    return h.p(null, () => String(b()));
  });
  for (let i = 1; i <= 3; i++) { a.set(i); flush(); }
  assert.equal(j.inspect('jr_eff').runs, 4);
  assert.equal(j.inspect('jr_b').runs, 4);
  const binding = j.graph().nodes.find((n: any) => n.kind === 'binding' && j.inspect(n.id).sources.includes('jr_b'));
  assert.equal(binding.runs, 4);
});

test('(d) graph(), inspect() and why(): basic shape, names from debugName, JSON-serializable', (t) => {
  const j = J();
  const a = signal(1, { debugName: 'jg_a' });
  const b = computed(() => a() * 2, { debugName: 'jg_b' });
  const view = mountTest(t, () => h.p(null, () => String(b())));
  const g = j.graph({ name: 'jg_a' });
  assert.equal(g.nodes.length, 1);
  assert.equal(g.nodes[0].kind, 'signal');
  assert.equal(g.nodes[0].value, '1');
  const full = j.graph();
  const ia = full.nodes.find((n: any) => n.name === 'jg_a').id;
  const ib = full.nodes.find((n: any) => n.name === 'jg_b').id;
  assert.ok(full.edges.some((e: any) => e.consumer === ib && e.producer === ia));
  const bindingId = full.edges.find((e: any) => e.producer === ib).consumer;
  assert.doesNotThrow(() => JSON.stringify(full));
  const ib2 = j.inspect('jg_b');
  assert.equal(ib2.kind, 'computed');
  assert.deepEqual(ib2.sources, ['jg_a']);
  assert.equal(ib2.observers.length, 1);
  const el = j.inspect(view.root.firstChild);
  assert.equal(el.kind, 'element');
  assert.equal(el.name, 'p');
  a.set(2);
  flush();
  const why = j.why(bindingId);
  assert.ok(Array.isArray(why));
  assert.match(why[0], /^jg_a\.set/);
  assert.equal(typeof j.graph({ name: 'nope' }).nodes.length, 'number');
});

// ================================================================ last: leaves global state behind when it fails

test('B19.1/B19.4 an EFFECT_LOOP in mountTest\'s first flush still unmounts the view (its checks are registered)', () => {
  const afters: (() => void)[] = [];
  const s = signal(0);
  const before = document.body.children.length;
  assert.throws(() => mountTest({ after: (fn) => afters.push(fn) }, () => { effect(() => { s.set(s() + 1); }); return h.p(null, 'loop'); }),
    (e) => codeOf(e) === 'EFFECT_LOOP');
  const stillMounted = document.body.children.length - before;
  // Clean up whatever is left so later files are unaffected.
  for (const fn of afters) { try { fn(); } catch { /* recorded warnings */ } }
  const cleanup = mountTest(fakeT(), () => h.i(null));
  try { cleanup.dispose(); } catch { /* recorded warnings of the stale test */ }
  assert.ok(afters.length === 1 || stillMounted === 0, `container left in body: ${stillMounted}, checks registered: ${afters.length}`);
});
