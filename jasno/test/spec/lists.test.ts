// Spec conformance: design.md B10 show/match, B11 each, B21 selector, B3.4 lagging Reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catchError, component, computed, createRoot, each, effect, flush, h, match, mount, onMount, selector, show, signal,
} from 'jasno';
import { mountTest } from 'jasno/testing';
import { capture } from '../helpers.ts';

type Read<T> = () => T;

function host(view: () => Node) {
  const target = document.createElement('div');
  document.body.append(target);
  const unmount = mount(view, target);
  return { target, unmount: () => { unmount(); target.remove(); } };
}

const texts = (root: ParentNode, sel = 'li') => [...root.querySelectorAll(sel)].map((n) => n.textContent);

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(a: T[], r: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}
function lisLength(seq: number[]): number {
  const tails: number[] = [];
  for (const x of seq) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m]! < x) lo = m + 1; else hi = m; }
    tails[lo] = x;
  }
  return tails.length;
}
/** Counts insertBefore calls on one parent (a row insert is one call per fragment, a move one per node). */
function spyInsert(parent: Node): { calls: number } {
  const c = { calls: 0 };
  const orig = parent.insertBefore;
  (parent as { insertBefore: unknown }).insertBefore = function (this: Node, n: Node, ref: Node | null) { c.calls++; return orig.call(this, n, ref); };
  return c;
}

// ================================================================ B10 show and match

test('B10.4 regions sit between two empty Text nodes and are invisible in innerHTML', (t) => {
  const on = signal(false);
  const view = mountTest(t, () => h.div(null,
    show(on, () => h.b(null, 'x')),
    match(() => 'k', (k) => h.i(null, k)),
    each(() => [] as number[], { key: (x) => x, render: () => h.u(null) })));
  const div = view.root.firstElementChild!;
  assert.equal(div.innerHTML, '<i>k</i>');
  const empties = [...div.childNodes].filter((n) => n.nodeType === 3 && (n as Text).data === '');
  assert.equal(empties.length, 6, 'two markers per region');
  on.set(true); flush();
  assert.equal(div.innerHTML, '<b>x</b><i>k</i>');
});

test('B10.1 show builds only on truthiness flips: truthy→truthy and falsy→falsy changes never rebuild', (t) => {
  const v = signal<unknown>(1);
  let thens = 0, others = 0;
  const view = mountTest(t, () => h.div(null, show(v, () => { thens++; return 'T'; }, () => { others++; return 'F'; })));
  for (const x of ['x', {}, [], -1, 1n, Infinity]) { v.set(x); flush(); }
  assert.equal(thens, 1);
  for (const x of [0, '', null, undefined, false, 0n, NaN]) { v.set(x); flush(); }
  assert.equal(others, 1);
  assert.equal(thens, 1);
  assert.equal(view.root.textContent, 'F');
  v.set('back'); flush();
  assert.equal(thens, 2);
  assert.equal(view.root.textContent, 'T');
});

test('B10.1/B3.4 the show value Read lags until the flush, then holds the latest truthy value', (t) => {
  const user = signal<{ name: string } | null>({ name: 'a' });
  let read!: Read<{ name: string }>;
  const view = mountTest(t, () => h.div(null, show(user, (u) => { read = u; return h.b(null, () => u().name); })));
  user.set({ name: 'b' });
  assert.equal(read().name, 'a', 'lagging until the next flush');
  flush();
  assert.equal(read().name, 'b');
  assert.equal(view.root.textContent, 'b');
  user.set(null); flush();
  assert.equal(read().name, 'b', 'latest truthy value survives the flip to falsy');
  user.set({ name: 'c' });
  assert.equal(read().name, 'b');
  flush();
  assert.equal(read().name, 'c');
  assert.equal(view.root.textContent, 'c');
});

test('B3.4/B4.3 bindings and effects in a show branch see the new value in the same flush', (t) => {
  const user = signal<{ name: string } | null>({ name: 'a' });
  const seen: string[] = [];
  let b!: HTMLElement;
  mountTest(t, () => h.div(null, show(user, (u) => {
    effect(() => { seen.push(`${u().name}:${b.textContent}`); });
    return (b = h.b(null, () => u().name));
  })));
  user.set({ name: 'b' }); flush();
  assert.deepEqual(seen.slice(-1), ['b:b'], 'the effect sees the new value and the updated DOM');
});

test('B10.5 switching: old branch disposed while its nodes are connected, removed, then the new branch is built', (t) => {
  const on = signal(true);
  const log: string[] = [];
  let yes!: Element;
  const view = mountTest(t, () => h.div(null, show(on, () => {
    const el = h.b(null, 'yes');
    yes = el;
    onMount(() => () => log.push(`cleanup connected=${el.isConnected}`));
    return el;
  }, () => { log.push(`otherwise built, old connected=${yes.isConnected}`); return h.i(null, 'no'); }), h.span(null, 'after')));
  on.set(false); flush();
  assert.deepEqual(log, ['cleanup connected=true', 'otherwise built, old connected=false']);
  assert.equal(view.root.innerHTML, '<div><i>no</i><span>after</span></div>');
});

test('B10.5 a DocumentFragment result contributes the child nodes it had when inserted', (t) => {
  const on = signal(true);
  let frag!: DocumentFragment;
  const view = mountTest(t, () => h.div(null, show(on, () => {
    frag = document.createDocumentFragment();
    frag.append(h.b(null, '1'), h.b(null, '2'));
    return frag;
  }), h.span(null, 'end')));
  assert.equal(view.root.innerHTML, '<div><b>1</b><b>2</b><span>end</span></div>');
  frag.append(document.createTextNode('late'));
  assert.equal(view.root.textContent, '12end');
  on.set(false); flush();
  assert.equal(view.root.innerHTML, '<div><span>end</span></div>');
  on.set(true); flush();
  assert.equal(view.root.innerHTML, '<div><b>1</b><b>2</b><span>end</span></div>');
});

test('B10.5 an array result and a string result are inserted in order and removed on switch', (t) => {
  const k = signal<'a' | 'b' | 'c'>('a');
  const view = mountTest(t, () => h.div(null, h.span(null, '['), match(k, (x) => (x === 'a' ? [h.b(null, 'A1'), 'A2', [h.b(null, 'A3')]] : x === 'b' ? 'B' : h.i(null, 'C'))), h.span(null, ']')));
  assert.equal(view.root.innerHTML, '<div><span>[</span><b>A1</b>A2<b>A3</b><span>]</span></div>');
  k.set('b'); flush();
  assert.equal(view.root.innerHTML, '<div><span>[</span>B<span>]</span></div>');
  k.set('c'); flush();
  assert.equal(view.root.innerHTML, '<div><span>[</span><i>C</i><span>]</span></div>');
});

test('B10.2 match compares keys with Object.is: NaN keeps the branch, 0 → -0 rebuilds, equal keys never rebuild', (t) => {
  const key = signal<number>(NaN, { equal: () => false });
  const built: string[] = [];
  mountTest(t, () => h.div(null, match(key, (k) => { built.push(Object.is(k, -0) ? '-0' : String(k)); return 'x'; })));
  key.set(NaN); flush();
  key.set(0); flush();
  key.set(0); flush();
  key.set(-0); flush();
  assert.deepEqual(built, ['NaN', '0', '-0']);
});

test('B10.2 match disposes the old branch before building the next one', (t) => {
  const key = signal(1);
  const log: string[] = [];
  mountTest(t, () => h.div(null, match(key, (k) => {
    log.push(`build ${k}`);
    onMount(({ abortSignal }) => { abortSignal.addEventListener('abort', () => log.push(`abort ${k}`)); return () => log.push(`cleanup ${k}`); });
    return h.p(null, String(k));
  })));
  key.set(2); flush();
  assert.deepEqual(log, ['build 1', 'abort 1', 'cleanup 1', 'build 2']);
});

test('B10.3/B12.1 builders run untracked under a new owner, labelled <Component> › show / › match / › each row', () => {
  const cap = capture();
  const s = signal(1, { debugName: 's' });
  const List = component(function List(): Node {
    return h.div(null,
      show(() => true, () => h.p(null, `a${s()}`)),
      match(() => 1, () => h.p(null, `b${s()}`)),
      each(() => [1], { key: (x) => x, render: () => h.p(null, `c${s()}`, show(() => true, () => h.p(null, `d${s()}`))) }));
  });
  const { target, unmount } = host(() => List());
  s.set(2); flush();
  cap.stop();
  assert.equal(target.textContent, 'a1b1c1d1', 'builder reads are untracked');
  const msgs = cap.diags.filter((d) => d.code === 'STRICT_READ_UNTRACKED');
  assert.equal(msgs.length, 4);
  assert.match(msgs[0]!.message, /read directly in <List> › show;/);
  assert.equal(msgs[0]!.ownerPath, '<List> › show');
  assert.match(msgs[1]!.message, /read directly in <List> › match;/);
  assert.match(msgs[2]!.message, /read directly in <List> › each row;/);
  assert.equal(msgs[2]!.ownerPath, '<List> › each row');
  assert.match(msgs[3]!.message, /read directly in <List> › show;/);
  assert.equal(msgs[3]!.ownerPath, '<List> › each row › show');
  unmount();
});

test('B10.1 a show whose branch throws at a later flip leaves the region empty and routes the error', () => {
  const cap = capture();
  const on = signal(false);
  const { target, unmount } = host(() => h.div(null, show(on, () => { throw new Error('branch'); }, () => 'off'), h.span(null, '!')));
  on.set(true); flush();
  cap.stop();
  assert.equal((cap.errors[0] as Error)?.message, 'branch');
  assert.equal(target.innerHTML, '<div><span>!</span></div>');
  unmount();
});

// ---------------------------------------------------------------- B10.6 NODE_OUTSIDE_REGION

test('B10.6 a show or match builder returning an element created in the parent setup reports NODE_OUTSIDE_REGION', () => {
  const cap = capture();
  const Comp = component(function Comp(): Node {
    const a = h.p(null, 'a');
    const b = h.p(null, 'b');
    return h.div(null, show(() => true, () => a), match(() => 1, () => b));
  });
  const { unmount } = host(() => Comp());
  cap.stop();
  unmount();
  const found = cap.diags.filter((d) => d.code === 'NODE_OUTSIDE_REGION');
  assert.equal(found.length, 2);
  assert.match(found[0]!.message, /show.* in <Comp> returned <p>, created outside it\./);
});

test('B10.6 an element cached from an earlier (disposed) branch reports NODE_OUTSIDE_REGION on the rebuild', () => {
  const cap = capture();
  const on = signal(true);
  let cached: HTMLElement | undefined;
  const { target, unmount } = host(() => h.div(null, show(on, () => (cached ??= h.p(null, 'x')))));
  assert.deepEqual(cap.codes(), []);
  on.set(false); flush();
  on.set(true); flush();
  cap.stop();
  unmount();
  assert.equal(target.textContent, '');
  assert.deepEqual(cap.codes(), ['NODE_OUTSIDE_REGION']);
});

test('B10.6 elements created in the builder, in a component it calls, or in a nested region never report', (t) => {
  const Inner = component(function Inner(): Node { return h.p(null, 'inner'); });
  const on = signal(true);
  const view = mountTest(t, () => h.div(null,
    show(on, () => Inner()),
    match(() => 1, () => show(() => true, () => h.p(null, 'nested'))),
    show(on, () => createRoot(() => h.p(null, 'root')))));
  on.set(false); flush(); on.set(true); flush();
  assert.equal(view.root.textContent, 'innernestedroot');
});

test('B10.6 an each row returning an element created outside the row reports NODE_OUTSIDE_REGION', () => {
  const cap = capture();
  const Comp = component(function Comp(): Node {
    const shared = h.li(null, 'shared');
    return h.ul(null, each(() => [1], { key: (x) => x, render: () => shared }));
  });
  const { unmount } = host(() => Comp());
  cap.stop();
  unmount();
  assert.deepEqual(cap.codes(), ['NODE_OUTSIDE_REGION']);
});

// ---------------------------------------------------------------- builder results that are live text

test('B10.3/B6.2 a live-text function returned by a show branch dies with the branch', (t) => {
  const on = signal(true);
  const ext = signal(0);
  let runs = 0;
  const view = mountTest(t, () => h.div(null, show(on, () => () => { runs++; return `n=${ext()}`; })));
  assert.equal(view.root.textContent, 'n=0');
  on.set(false); flush();
  assert.equal(view.root.textContent, '');
  const before = runs;
  ext.set(1); flush();
  assert.equal(runs, before, 'the text binding of a disposed branch must not run');
});

test('B11.3 a live-text function returned by a row dies with the row', (t) => {
  const list = signal([1, 2]);
  const ext = signal(0);
  const ran: number[] = [];
  const view = mountTest(t, () => h.p(null, each(list, { key: (x) => x, render: (_x, _i, k) => () => { ran.push(k); return `${k}:${ext()};`; } })));
  assert.equal(view.root.textContent, '1:0;2:0;');
  list.set([1]); flush();
  ran.length = 0;
  ext.set(1); flush();
  assert.equal(view.root.textContent, '1:1;');
  assert.deepEqual(ran, [1], 'the removed row\'s text binding must not run');
});

test('B11.6 a removed row whose live-text result reads a store never runs against the removed entry', (t) => {
  const store = signal<Record<number, { name: string }>>({ 1: { name: 'a' }, 2: { name: 'b' } });
  const ids = computed(() => Object.keys(store()).map(Number));
  const view = mountTest(t, () => h.p(null, each(ids, { key: (id) => id, render: (_x, _i, id) => () => store()[id]!.name })));
  assert.equal(view.root.textContent, 'ab');
  store.set({ 1: { name: 'a' } });
  flush();
  assert.equal(view.root.textContent, 'a');
});

test('B11.6 control: the same store lookup wrapped in an element is disposed with the row', (t) => {
  const store = signal<Record<number, { name: string }>>({ 1: { name: 'a' }, 2: { name: 'b' } });
  const ids = computed(() => Object.keys(store()).map(Number));
  const view = mountTest(t, () => h.ul(null, each(ids, { key: (id) => id, render: (_x, _i, id) => h.li(null, () => store()[id]!.name) })));
  store.set({ 1: { name: 'a' } });
  flush();
  assert.deepEqual(texts(view.root), ['a']);
});

test('B8.5 an error from a live-text function returned by tryFn is caught by its catchError', (t) => {
  const fail = signal(false);
  const view = mountTest(t, () => h.div(null, catchError(() => () => { if (fail()) throw new Error('late'); return 'ok'; },
    (e) => `caught ${(e as Error).message}`)));
  assert.equal(view.root.textContent, 'ok');
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'caught late');
});

// ================================================================ B11 each

test('B11.1 keys are computed untracked: a signal read in the key function never re-runs the list binding', (t) => {
  const prefix = signal('a');
  let keyCalls = 0;
  const list = signal([1, 2]);
  const view = mountTest(t, () => h.ul(null, each(list, { key: (x) => { keyCalls++; return `${prefix()}${x}`; }, render: (_x, _i, k) => h.li(null, k) })));
  const calls = keyCalls;
  prefix.set('b'); flush();
  assert.equal(keyCalls, calls);
  assert.deepEqual(texts(view.root), ['a1', 'a2']);
  list.set([1, 2, 3]); flush();
  assert.deepEqual(texts(view.root), ['b1', 'b2', 'b3'], 'the next list change uses the key function afresh');
});

test('B11.1 dev: the key function runs twice for new or changed items and once for unchanged ones', (t) => {
  let calls = 0;
  const a = { id: 1 }, b = { id: 2 }, c = { id: 3 };
  const list = signal([a, b]);
  mountTest(t, () => h.ul(null, each(list, { key: (x) => { calls++; return x.id; }, render: (x) => h.li(null, () => String(x().id)) })));
  assert.equal(calls, 4);
  list.set([a, b, c]); flush();
  assert.equal(calls, 4 + 1 + 1 + 2);
  list.set([{ id: 1 }, b, c]); flush();
  assert.equal(calls, 8 + 2 + 1 + 1);
});

test('B11.1 UNSTABLE_KEY names both results; a key that uses the index is stable', () => {
  const cap = capture();
  let n = 0;
  const { unmount } = host(() => h.ul(null,
    each(() => ['x'], { key: () => ++n, render: () => h.li(null, 'r') }),
    each(() => ['p', 'q'], { key: (_x, i) => i, render: () => h.li(null, 'i') })));
  cap.stop();
  unmount();
  assert.deepEqual(cap.codes(), ['UNSTABLE_KEY']);
  assert.match(cap.diags[0]!.message, /each\(\) key in .* returned 1, then 2 for the same item\./);
});

test('B11.2 same object and same index: row bindings are not notified; a new object updates the row in place', (t) => {
  const a = { id: 1, v: 'a' }, b = { id: 2, v: 'b' };
  const list = signal([a, b]);
  let itemRuns = 0, indexRuns = 0;
  const view = mountTest(t, () => h.ul(null, each(list, {
    key: (x) => x.id,
    render: (x, i) => h.li(null, h.input({ 'aria-label': 'f' }), () => { itemRuns++; return x().v; }, () => { indexRuns++; return i(); }),
  })));
  const [li1, li2] = view.root.querySelectorAll('li');
  (li1!.querySelector('input') as HTMLInputElement).value = 'typed';
  list.set([a, b]); flush();
  assert.equal(itemRuns, 2);
  assert.equal(indexRuns, 2);
  list.set([{ id: 1, v: 'A' }, b]); flush();
  assert.equal(itemRuns, 3, 'only the row with a new object re-runs');
  assert.equal(indexRuns, 2);
  list.set([{ id: 0, v: 'z' }, { id: 1, v: 'A' }, b]); flush();
  const now = view.root.querySelectorAll('li');
  assert.equal(now[1], li1);
  assert.equal(now[2], li2);
  assert.deepEqual(texts(view.root), ['z0', 'A1', 'b2']);
  assert.equal((li1!.querySelector('input') as HTMLInputElement).value, 'typed', 'DOM state kept');
});

test('B3.4 row item and index Reads lag until the flush; the list itself is read-your-writes', (t) => {
  const list = signal([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
  const items = new Map<number, [Read<{ id: number; v: string }>, Read<number>]>();
  mountTest(t, () => h.ul(null, each(list, { key: (x) => x.id, render: (x, i, k) => { items.set(k, [x, i]); return h.li(null, () => x().v); } })));
  list.set([{ id: 2, v: 'B' }, { id: 1, v: 'a' }]);
  assert.equal(list()[0]!.v, 'B');
  assert.equal(items.get(2)![0]().v, 'b');
  assert.equal(items.get(2)![1](), 1);
  flush();
  assert.equal(items.get(2)![0]().v, 'B');
  assert.equal(items.get(2)![1](), 0);
  assert.equal(items.get(1)![1](), 1);
});

test('B11.2/B4.3 a row effect sees the new item in the same flush; a row binding never sees a new sibling signal with the old item', (t) => {
  const list = signal([{ id: 1, v: 'a' }]);
  const ext = signal(0);
  const seen: string[] = [];
  const effects: string[] = [];
  mountTest(t, () => h.ul(null, each(list, {
    key: (x) => x.id,
    render: (x) => {
      effect(() => { effects.push(x().v); });
      return h.li(null, () => { const s = `${x().v}${ext()}`; seen.push(s); return s; });
    },
  })));
  list.set([{ id: 1, v: 'b' }]); ext.set(1); flush();
  assert.deepEqual(seen, ['a0', 'b1'], 'one run with the consistent pair');
  assert.deepEqual(effects, ['a', 'b']);
});

test('B11.3 render gets the plain key; a removed row is disposed while its nodes are still connected, then removed', (t) => {
  const list = signal(['x', 'y']);
  const log: string[] = [];
  const view = mountTest(t, () => h.ul(null, each(list, {
    key: (s) => `k-${s}`,
    render: (_x, _i, key) => {
      const li = h.li(null, key);
      onMount(() => () => log.push(`${key} connected=${li.isConnected}`));
      return li;
    },
  })));
  assert.deepEqual(texts(view.root), ['k-x', 'k-y']);
  list.set(['y']); flush();
  assert.deepEqual(log, ['k-x connected=true']);
  assert.deepEqual(texts(view.root), ['k-y']);
});

test('B11.6 rows removed in the same flush as a signal they read are disposed before their bindings or effects run', (t) => {
  const list = signal([1, 2, 3]);
  const ext = signal(0);
  const ran: string[] = [];
  mountTest(t, () => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => {
      effect(() => { ran.push(`e${k}:${ext()}`); });
      return h.li(null, show(() => ext() > 0, () => { ran.push(`show${k}`); return 'on'; }), () => { ran.push(`b${k}:${ext()}`); return String(k); });
    },
  })));
  ran.length = 0;
  ext.set(1); list.set([2]); flush();
  assert.deepEqual(ran.sort(), ['b2:1', 'e2:1', 'show2']);
});

// ---------------------------------------------------------------- B11.4 order and moves

test('B11.4 moves are minimal: rows on the longest increasing subsequence stay (move-to-end, swap, reverse)', (t) => {
  const list = signal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const view = mountTest(t, () => h.ul(null, each(list, { key: (x) => x, render: (_x, _i, k) => h.li(null, String(k)) })));
  const ul = view.root.querySelector('ul')!;
  const spy = spyInsert(ul);
  const step = (next: number[], moves: number) => {
    spy.calls = 0;
    list.set(next); flush();
    assert.deepEqual(texts(ul), next.map(String));
    assert.equal(spy.calls, moves, `moves for ${next.join(',')}`);
  };
  step([2, 3, 4, 5, 6, 7, 8, 9, 10, 1], 1);
  step([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1);
  step([1, 9, 3, 4, 5, 6, 7, 8, 2, 10], 2);
  step([10, 2, 8, 7, 6, 5, 4, 3, 9, 1], 9);
  step([10, 2, 8, 7, 6, 5, 4, 3, 9, 1], 0);
});

test('B11.4 large random reorders with inserts and removals: DOM order equals list order, identity kept, moves minimal', (t) => {
  const r = rng(42);
  let nextId = 0;
  let model = Array.from({ length: 150 }, () => nextId++);
  const list = signal(model);
  const disposed = new Map<number, number>();
  const view = mountTest(t, () => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, i, k) => { onMount(() => () => disposed.set(k, (disposed.get(k) ?? 0) + 1)); return h.li({ id: `r${k}` }, () => `${k}@${i()}`); },
  })));
  const ul = view.root.querySelector('ul')!;
  const spy = spyInsert(ul);
  for (let round = 0; round < 40; round++) {
    const before = new Map([...ul.children].map((li) => [li.id, li]));
    const oldPos = new Map(model.map((k, i) => [k, i]));
    let next = model.filter(() => r() > 0.1);
    if (r() < 0.5) next = shuffle(next, r);
    else for (let s = 0; s < 5; s++) { const i = Math.floor(r() * next.length), j = Math.floor(r() * next.length); [next[i], next[j]] = [next[j]!, next[i]!]; }
    const added: number[] = [];
    for (let a = Math.floor(r() * 12); a--;) { const k = nextId++; added.push(k); next.splice(Math.floor(r() * (next.length + 1)), 0, k); }
    const removed = model.filter((k) => !next.includes(k));
    spy.calls = 0;
    list.set(next); flush();
    assert.deepEqual([...ul.children].map((li) => li.textContent), next.map((k, i) => `${k}@${i}`), `round ${round}`);
    for (const k of next) if (before.has(`r${k}`)) assert.equal(ul.querySelector(`#r${k}`), before.get(`r${k}`));
    for (const k of removed) assert.equal(disposed.get(k), 1);
    const kept = next.filter((k) => oldPos.has(k));
    const expectedMoves = kept.length - lisLength(kept.map((k) => oldPos.get(k)!));
    assert.equal(spy.calls, expectedMoves + added.length, `round ${round}: insertBefore calls`);
    model = next;
  }
  for (const k of model) assert.equal(disposed.has(k), false);
});

test('B11.7 rows returning fragments, arrays or nothing keep DOM order equal to list order through reorders', (t) => {
  const r = rng(7);
  let model = Array.from({ length: 40 }, (_, i) => i);
  const list = signal(model);
  const view = mountTest(t, () => h.div(null, h.span(null, '<'), each(list, {
    key: (x) => x,
    render: (_x, _i, k) => {
      if (k % 3 === 0) return null;
      if (k % 3 === 1) { const f = document.createDocumentFragment(); f.append(h.b(null, `${k}a`), h.b(null, `${k}b`)); return f; }
      return [h.b(null, `${k}x`), `t${k}`, h.b(null, `${k}y`)];
    },
  }), h.span(null, '>')));
  const expected = (m: number[]) => '<' + m.map((k) => (k % 3 === 0 ? '' : k % 3 === 1 ? `${k}a${k}b` : `${k}xt${k}${k}y`)).join('') + '>';
  const div = view.root.firstElementChild!;
  assert.equal(div.textContent, expected(model));
  let nextId = 100;
  for (let round = 0; round < 30; round++) {
    let next = shuffle(model.filter(() => r() > 0.15), r);
    for (let a = Math.floor(r() * 4); a--;) next.splice(Math.floor(r() * (next.length + 1)), 0, nextId++);
    list.set(next); flush();
    assert.equal(div.textContent, expected(next), `round ${round}`);
    model = next;
  }
  list.set([]); flush();
  assert.equal(div.innerHTML, '<span>&lt;</span><span>&gt;</span>');
});

test('B11.4 focus inside a moved multi-node row (insertBefore fallback) stays on the focused element', (t) => {
  const list = signal([1, 2, 3]);
  const view = mountTest(t, () => h.div(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => [h.span(null, `s${k}`), h.label(null, `f${k}`, h.input({ id: `in${k}` }))],
  })));
  const input = view.root.querySelector('#in3') as HTMLInputElement;
  input.focus();
  assert.equal(document.activeElement, input);
  list.set([3, 1, 2]); flush();
  assert.equal(document.activeElement, input);
  assert.deepEqual([...view.root.querySelectorAll('span')].map((s) => s.textContent), ['s3', 's1', 's2']);
});

test('B11.4 a row moved with insertBefore is re-focused with focus({ preventScroll: true }) when the move blurred it', (t) => {
  const list = signal([1, 2, 3]);
  const view = mountTest(t, () => h.div(null, each(list, { key: (x) => x, render: (_x, _i, k) => h.button(null, `b${k}`) })));
  const b3 = view.root.querySelectorAll('button')[2]! as HTMLButtonElement;
  const calls: unknown[] = [];
  const orig = b3.focus;
  b3.focus = function (this: HTMLButtonElement, o?: FocusOptions) { calls.push(o); return orig.call(this, o); };
  b3.focus();
  calls.length = 0;
  const div = view.root.firstElementChild!;
  const ins = div.insertBefore;
  let blurred = false;
  (div as { insertBefore: unknown }).insertBefore = function (this: Node, n: Node, ref: Node | null) {
    const r = ins.call(this, n, ref);
    if (document.activeElement !== b3) blurred = true;
    return r;
  };
  list.set([3, 1, 2]); flush();
  assert.equal(blurred, true, 'happy-dom blurs on insertBefore, so the fallback path runs');
  assert.equal(document.activeElement, b3);
  assert.deepEqual(calls, [{ preventScroll: true }]);
});

test('B11.4 Element.moveBefore is used for moves when present', (t) => {
  const list = signal([1, 2, 3]);
  const view = mountTest(t, () => h.div(null, each(list, { key: (x) => x, render: (_x, _i, k) => h.p(null, `p${k}`) })));
  const div = view.root.firstElementChild! as HTMLElement & { moveBefore?: (n: Node, r: Node | null) => void };
  let moves = 0;
  div.moveBefore = function (n, ref) { moves++; this.insertBefore(n, ref); };
  list.set([3, 1, 2]); flush();
  assert.equal(moves, 1);
  assert.deepEqual(texts(div, 'p'), ['p3', 'p1', 'p2']);
});

test('B11.4 focus inside a nested each row survives a move of the outer row', (t) => {
  const outer = signal([1, 2, 3]);
  const view = mountTest(t, () => h.div(null, each(outer, {
    key: (x) => x,
    render: (_x, _i, k) => h.section(null, each(() => [k * 10, k * 10 + 1], { key: (y) => y, render: (_y, _j, y) => h.button(null, `b${y}`) })),
  })));
  const b = [...view.root.querySelectorAll('button')].find((x) => x.textContent === 'b31')!;
  b.focus();
  outer.set([3, 1, 2]); flush();
  assert.equal(document.activeElement, b);
  assert.deepEqual(texts(view.root, 'button'), ['b30', 'b31', 'b10', 'b11', 'b20', 'b21']);
});

// ---------------------------------------------------------------- B11.5 duplicates

test('B11.5 duplicate keys: the first occurrence owns the row, later duplicates get fresh rows on every update', () => {
  const cap = capture();
  const a1 = { id: 1, v: 'a1' }, a2 = { id: 1, v: 'a2' }, b = { id: 2, v: 'b' };
  const list = signal([a1, b, a2]);
  const disposed: string[] = [];
  const { target, unmount } = host(() => h.ul(null, each(list, {
    key: (x) => x.id,
    render: (x) => { const v = x().v; onMount(() => () => disposed.push(v)); return h.li(null, () => x().v); },
  })));
  flush();
  const [first, , dup] = target.querySelectorAll('li');
  list.set([a1, b, a2]); flush();
  let now = target.querySelectorAll('li');
  assert.equal(now[0], first);
  assert.notEqual(now[2], dup, 'the duplicate row is fresh');
  assert.deepEqual(texts(target), ['a1', 'b', 'a2']);
  list.set([a2, b]); flush();
  now = target.querySelectorAll('li');
  assert.equal(now[0], first, 'first occurrence keeps the key\'s row with the new item');
  assert.deepEqual(texts(target), ['a2', 'b']);
  cap.stop();
  unmount();
  assert.ok(cap.codes().includes('DUPLICATE_KEY'));
  assert.match(cap.diags.find((d) => d.code === 'DUPLICATE_KEY')!.message, /each\(\) in .* got key 1 more than once\./);
  assert.ok(cap.codes().every((c) => c === 'DUPLICATE_KEY' || c === 'STRICT_READ_UNTRACKED'));
  assert.deepEqual(disposed.slice(0, 2), ['a2', 'a2'], 'both duplicate rows were disposed');
});

// ---------------------------------------------------------------- errors in reconciliation

test('B8.9 a row throwing on first creation still inserts the other rows, and the error reaches the catchError on the stack', (t) => {
  const view = mountTest(t, () => h.div(null, catchError(
    () => h.ul(null, each(() => [1, 2, 3], { key: (x) => x, render: (_x, _i, k) => { if (k === 2) throw new Error('row 2'); return h.li(null, String(k)); } })),
    (e) => `caught ${(e as Error).message}`)));
  assert.equal(view.root.textContent, 'caught row 2');
});

test('B11/B8.4 a key function that throws mid-update leaves no orphan rows (onMount of never-inserted rows)', () => {
  const cap = capture();
  let bad = false;
  const mounts: number[] = [];
  const list = signal([1]);
  const { target, unmount } = host(() => h.ul(null, each(list, {
    key: (x) => { if (bad && x === 3) throw new Error('key'); return x; },
    render: (_x, _i, k) => { onMount(() => { mounts.push(k); }); return h.li(null, String(k)); },
  })));
  flush();
  bad = true;
  list.set([1, 2, 3]); flush();
  assert.equal((cap.errors[0] as Error)?.message, 'key');
  bad = false;
  list.set([1, 2, 3, 4]); flush();
  cap.stop();
  assert.deepEqual(texts(target), ['1', '2', '3', '4']);
  unmount();
  assert.deepEqual(mounts, [1, 2, 3, 4], 'row 2 mounted once');
});

// ---------------------------------------------------------------- nested regions

test('B10/B11 show inside rows: rows moved and branches toggled in the same flush keep contents inside their rows', (t) => {
  const list = signal([{ id: 1, on: false }, { id: 2, on: true }, { id: 3, on: false }]);
  const view = mountTest(t, () => h.div(null, each(list, {
    key: (x) => x.id,
    render: (x, _i, id) => [h.h3(null, `H${id}`), show(() => x().on, () => h.p(null, `P${id}`), () => h.i(null, `I${id}`))],
  })));
  const seq = () => [...view.root.querySelectorAll('h3, p, i')].map((n) => n.textContent).join(' ');
  assert.equal(seq(), 'H1 I1 H2 P2 H3 I3');
  list.set([{ id: 3, on: true }, { id: 1, on: true }, { id: 2, on: false }]); flush();
  assert.equal(seq(), 'H3 P3 H1 P1 H2 I2');
  list.set([{ id: 2, on: true }, { id: 3, on: false }]); flush();
  assert.equal(seq(), 'H2 P2 H3 I3');
});

test('B10/B11 each inside show: toggling off disposes every row, toggling on builds fresh rows', (t) => {
  const on = signal(true);
  const list = signal([1, 2]);
  const log: string[] = [];
  const view = mountTest(t, () => h.div(null, show(on, () => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => { log.push(`build ${k}`); onMount(() => () => log.push(`dispose ${k}`)); return h.li(null, String(k)); },
  })))));
  on.set(false); list.set([2, 3]); flush();
  assert.equal(view.root.textContent, '');
  assert.deepEqual(log.filter((l) => l.startsWith('dispose')).sort(), ['dispose 1', 'dispose 2']);
  log.length = 0;
  on.set(true); flush();
  assert.deepEqual(log, ['build 2', 'build 3']);
  assert.deepEqual(texts(view.root), ['2', '3']);
});

test('B10/B11 nested groups: random reorders, toggles and inner list edits keep document order equal to the model', (t) => {
  type Group = { id: number; open: boolean; items: number[] };
  const r = rng(99);
  let nextItem = 1000;
  let model: Group[] = Array.from({ length: 8 }, (_, g) => ({ id: g, open: r() > 0.5, items: Array.from({ length: 4 }, (_, i) => g * 100 + i) }));
  const groups = signal(model);
  const view = mountTest(t, () => h.div(null, each(groups, {
    key: (g) => g.id,
    render: (g, _i, id) => [
      h.h3(null, `G${id}`),
      show(() => g().open, () => h.ul(null, each(() => g().items, { key: (k) => k, render: (_x, _j, k) => h.li(null, `i${k}`) }))),
      h.hr(null),
    ],
  })));
  const expected = (m: Group[]) => m.flatMap((g) => [`G${g.id}`, ...(g.open ? g.items.map((k) => `i${k}`) : [])]);
  const actual = () => [...view.root.querySelectorAll('h3, li')].map((n) => n.textContent);
  assert.deepEqual(actual(), expected(model));
  const heads = new Map([...view.root.querySelectorAll('h3')].map((n) => [n.textContent, n]));
  for (let round = 0; round < 40; round++) {
    let next = model.map((g) => {
      let items = g.items.filter(() => r() > 0.2);
      if (r() < 0.5) items = shuffle(items, r);
      if (r() < 0.5) items.splice(Math.floor(r() * (items.length + 1)), 0, nextItem++);
      return r() < 0.3 ? { ...g, open: !g.open, items } : { ...g, items };
    });
    if (r() < 0.6) next = shuffle(next, r);
    groups.set(next); flush();
    assert.deepEqual(actual(), expected(next), `round ${round}`);
    model = next;
  }
  for (const n of view.root.querySelectorAll('h3')) assert.equal(n, heads.get(n.textContent));
});

// ================================================================ B21 selector

test('B21.3 a selection change re-runs only the row bindings whose answer flips', (t) => {
  const sel = signal<number | null>(null);
  const runs = new Map<number, number>();
  const view = mountTest(t, () => {
    const isSelected = selector(sel);
    return h.ul(null, each(() => Array.from({ length: 50 }, (_, i) => i), {
      key: (x) => x,
      render: (_x, _i, k) => h.li({ class: { on: () => { runs.set(k, (runs.get(k) ?? 0) + 1); return isSelected(k); } } }, String(k)),
    }));
  });
  const total = () => [...runs.values()].reduce((a, b) => a + b, 0);
  assert.equal(total(), 50);
  sel.set(3); flush();
  assert.equal(total(), 51);
  assert.equal(runs.get(3), 2);
  sel.set(7); flush();
  assert.equal(total(), 53);
  sel.set(7); flush();
  assert.equal(total(), 53);
  sel.set(99); flush();
  assert.equal(total(), 54);
  assert.deepEqual([...view.root.querySelectorAll('li.on')].length, 0);
  sel.set(10); flush();
  assert.equal(view.root.querySelector('li.on')!.textContent, '10');
});

test('B21.2/B3.1 outside a consumer isSelected returns the current comparison right after a write, also through a computed', () => {
  const sel = signal(1);
  const doubled = computed(() => sel() * 2);
  const dispose = createRoot((d) => {
    const a = selector(sel);
    const b = selector(doubled);
    assert.equal(a(1), true);
    sel.set(2);
    assert.equal(a(2), true);
    assert.equal(a(1), false);
    assert.equal(b(4), true);
    sel.set(3);
    assert.equal(b(6), true);
    assert.equal(b(4), false);
    return d;
  });
  dispose();
});

test('B21.2/B21.3 an effect asking about one key re-runs only when that key\'s answer flips', (t) => {
  const sel = signal('a');
  const log: boolean[] = [];
  mountTest(t, () => {
    const isSel = selector(sel);
    effect(() => { log.push(isSel('b')); });
    return h.p(null, 'x');
  });
  sel.set('b'); flush();
  sel.set('c'); flush();
  sel.set('d'); flush();
  sel.set('b'); flush();
  assert.deepEqual(log, [false, true, false, true]);
});

test('B21.1 a selector belongs to its owner: after the branch is disposed its source never runs again', (t) => {
  const on = signal(true);
  const sel = signal(0);
  let runs = 0;
  mountTest(t, () => h.div(null, show(on, () => {
    const isSel = selector(() => { runs++; return sel(); });
    return h.p({ class: { on: () => isSel(1) } }, 'x');
  })));
  sel.set(1); flush();
  const before = runs;
  on.set(false); flush();
  sel.set(2); flush();
  sel.set(3); flush();
  assert.equal(runs, before);
});

test('B21 rows removed from the list stop listening: selecting their key re-runs nothing', (t) => {
  const sel = signal(-1);
  const list = signal([1, 2, 3]);
  let runs = 0;
  const view = mountTest(t, () => {
    const isSel = selector(sel);
    return h.ul(null, each(list, { key: (x) => x, render: (_x, _i, k) => h.li({ 'aria-current': () => { runs++; return isSel(k) ? 'true' : null; } }, String(k)) }));
  });
  list.set([1, 3]); flush();
  const before = runs;
  sel.set(2); flush();
  assert.equal(runs, before);
  sel.set(3); flush();
  assert.equal(runs, before + 1);
  assert.equal(view.root.querySelector('[aria-current]')!.textContent, '3');
});

test('B21.4 a write re-reads the selector source at once; isSelected() is current before the flush', (t) => {
  const sel = signal(0);
  let runs = 0;
  mountTest(t, () => {
    const isSel = selector(() => { runs++; return sel(); });
    return h.p({ class: { on: () => isSel(1) } }, 'x');
  });
  const before = runs;
  sel.set(1);
  sel.set(2);
  sel.set(1);
  assert.equal(runs, before + 3, 'the source is re-read in each set()');
  flush();
});

// ================================================================ more interactions

test('B10.1/B4.3 a match inside a show branch is not rebuilt when the show flips off in the same flush', (t) => {
  const on = signal(true);
  const key = signal('a');
  const built: string[] = [];
  const view = mountTest(t, () => h.div(null, show(on, () => match(key, (k) => { built.push(k); return h.p(null, k); }))));
  on.set(false); key.set('b'); flush();
  assert.deepEqual(built, ['a']);
  assert.equal(view.root.textContent, '');
  on.set(true); flush();
  assert.deepEqual(built, ['a', 'b']);
});

test('B11.7/B10.5 rows that are only a show region move correctly while their branches toggle', (t) => {
  const r = rng(3);
  type It = { id: number; on: boolean };
  let model: It[] = Array.from({ length: 20 }, (_, id) => ({ id, on: r() > 0.5 }));
  const list = signal(model);
  const view = mountTest(t, () => h.div(null, each(list, {
    key: (x) => x.id,
    render: (x, _i, id) => show(() => x().on, () => [h.b(null, `${id}`), h.i(null, `${id}`)]),
  })));
  const div = view.root.firstElementChild!;
  const expected = (m: It[]) => m.filter((x) => x.on).map((x) => `${x.id}${x.id}`).join('');
  for (let round = 0; round < 40; round++) {
    const next = shuffle(model, r).map((x) => (r() < 0.3 ? { ...x, on: !x.on } : x));
    list.set(next); flush();
    assert.equal(div.textContent, expected(next), `round ${round}`);
    model = next;
  }
});

test('B4.3/B5.4 a row render that writes the list converges within the same flush', () => {
  const cap = capture();
  const list = signal(['a']);
  const { target, unmount } = host(() => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => { if (k === 'a') list.set(['a', 'b']); return h.li(null, k); },
  })));
  flush();
  cap.stop();
  assert.deepEqual(texts(target), ['a', 'b']);
  assert.deepEqual(cap.codes(), ['WRITE_IN_SETUP']);
  unmount();
});

test('B4.3/B11.3 rows whose onMount removes them from the list are disposed in the next round of the same flush', (t) => {
  const list = signal([1, 2, 3, 4]);
  const log: string[] = [];
  const view = mountTest(t, () => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => {
      onMount(() => { if (k % 2) list.update((a) => a.filter((x) => x !== k)); return () => log.push(`dispose ${k}`); });
      return h.li(null, String(k));
    },
  })));
  assert.deepEqual(texts(view.root), ['2', '4']);
  assert.deepEqual(log, ['dispose 1', 'dispose 3']);
});

test('B6.3/B11.3 a throwing row cleanup is reported and the reconciliation still completes', () => {
  const cap = capture();
  const list = signal([1, 2, 3]);
  const { target, unmount } = host(() => h.ul(null, each(list, {
    key: (x) => x,
    render: (_x, _i, k) => { onMount(() => () => { if (k === 2) throw new Error('cleanup 2'); }); return h.li(null, String(k)); },
  })));
  flush();
  list.set([4, 3, 1]); flush();
  cap.stop();
  assert.deepEqual(cap.errors.map((e) => (e as Error).message), ['cleanup 2']);
  assert.deepEqual(texts(target), ['4', '3', '1']);
  unmount();
});

test('B8.5/B6.3 a show whose old branch cleanup throws inside catchError builds no live branch in the disposed subtree', (t) => {
  const on = signal(true);
  const log: string[] = [];
  const view = mountTest(t, () => h.div(null, catchError(
    () => h.section(null, show(on,
      () => { onMount(() => () => { throw new Error('cleanup'); }); return 'A'; },
      () => { onMount(() => { log.push('otherwise mounted'); }); return 'B'; })),
    (e) => `caught ${(e as Error).message}`)));
  on.set(false); flush();
  assert.equal(view.root.textContent, 'caught cleanup');
  assert.deepEqual(log, [], 'the replacement branch of a disposed subtree never mounts');
});

test('B8.5/B11 an each at the top of a try region whose removed row cleanup throws: fallback shown, no follow-up error', (t) => {
  const list = signal([1, 2]);
  const view = mountTest(t, () => h.div(null, catchError(
    () => each(list, { key: (x) => x, render: (_x, _i, k) => { onMount(() => () => { if (k === 1) throw new Error('cleanup 1'); }); return h.p(null, String(k)); } }),
    (e) => `caught ${(e as Error).message}`)));
  list.set([2, 3]); flush();
  assert.equal(view.root.textContent, 'caught cleanup 1');
});

test('B21/B8.5: a throwing selector source inside catchError swaps to the fallback in the flush, not inside set()', (t) => {
  const sel = signal(0);
  let domDuringHandler = '';
  const view = mountTest(t, () => h.div(null, catchError(() => {
    const isSel = selector(() => { if (sel() < 0) throw new Error('bad'); return sel(); });
    return h.p({ class: { on: () => isSel(1) } }, 'content');
  }, (e) => `caught ${(e as Error).message}`)));
  sel.set(-1);
  domDuringHandler = view.root.textContent ?? '';
  flush();
  assert.equal(view.root.textContent, 'caught bad');
  assert.equal(domDuringHandler, 'content', 'the DOM changes in the flush, not synchronously inside set()');
});
