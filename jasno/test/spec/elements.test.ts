// Spec conformance: design.md B13 (context), B14 (components), B15 (h, svg), B16 (mount), B18 (css).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindChecked, bindNumber, bindValue, catchError, component, computed, createContext, each, effect, flush, h, mount, onMount,
  provide, show, signal, svg, useContext, css,
} from '@jasno/core';
import { mountTest, settled } from '@jasno/core/testing';
import { capture, codeOf, deferred, tick } from '../helpers.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props that only a cast or spread can produce
type Any = any;

function withTarget<T>(fn: (target: HTMLElement) => T): T {
  const target = document.createElement('div');
  document.body.append(target);
  try { return fn(target); } finally { target.remove(); }
}

async function withTargetAsync<T>(fn: (target: HTMLElement) => Promise<T>): Promise<T> {
  const target = document.createElement('div');
  document.body.append(target);
  try { return await fn(target); } finally { target.remove(); }
}

/** Counts assignments to an instance property, forwarding to the prototype accessor. */
function spy(el: object, prop: string): { writes: unknown[] } {
  let proto = Object.getPrototypeOf(el);
  let d: PropertyDescriptor | undefined;
  while (proto && !(d = Object.getOwnPropertyDescriptor(proto, prop))) proto = Object.getPrototypeOf(proto);
  const log = { writes: [] as unknown[] };
  Object.defineProperty(el, prop, {
    configurable: true,
    get() { return d!.get!.call(el); },
    set(v) { log.writes.push(v); d!.set!.call(el, v); },
  });
  return log;
}

// ================================================================ B13 context

test('B13.1 provide returns the node fn returned', (t) => {
  const Ctx = createContext<number>('Ctx');
  let inner: Node | undefined;
  const view = mountTest(t, () => {
    const out = provide(Ctx, 1, () => (inner = h.p(null, 'x')));
    assert.equal(out, inner);
    return out;
  });
  assert.equal(view.root.firstChild, inner);
});

test('B13.2 nearest provider wins; siblings do not see each other; an explicit undefined value is returned, not the default', (t) => {
  const Ctx = createContext<string | undefined>('Ctx', 'default');
  const seen: (string | undefined)[] = [];
  const Leaf = component(function Leaf(): Node { seen.push(useContext(Ctx)); return h.i(null); });
  mountTest(t, () => h.div(null,
    provide(Ctx, 'outer', () => h.div(null, Leaf(), provide(Ctx, 'inner', () => Leaf()), Leaf())),
    Leaf(),
    provide(Ctx, undefined, () => Leaf())));
  assert.deepEqual(seen, ['outer', 'inner', 'outer', 'default', undefined]);
});

test('B13.2 NO_PROVIDER names the context and owner path; the hint says to pass () => Child', () => {
  const Ctx = createContext<number>('Session');
  const Leaf = component(function Leaf(): Node { useContext(Ctx); return h.i(null); });
  const App = component(function App(): Node { return h.div(null, Leaf()); });
  let err: unknown;
  try { mount(() => App(), document.createElement('div')); } catch (e) { err = e; }
  assert.equal(codeOf(err), 'NO_PROVIDER');
  const d = (err as { diag: { message: string; hint: string } }).diag;
  assert.match(d.message, /No provider for context "Session" in .*<App> › <Leaf>/);
  assert.match(d.hint, /pass \(\) => Child/);
});

test('B13.2 a default of undefined counts as a default (no throw)', (t) => {
  const Ctx = createContext<number | undefined>('Opt', undefined);
  let got: unknown = 'unset';
  mountTest(t, () => { got = useContext(Ctx); return h.i(null); });
  assert.equal(got, undefined);
});

test('B13.3 CONTEXT_OUTSIDE_OWNER in a handler, after await, in a computed and in a binding', async (t) => {
  const Ctx = createContext<number>('Ctx', 1);
  const codes: (string | undefined)[] = [];
  const c = computed(() => { try { useContext(Ctx); return 'ok'; } catch (e) { return codeOf(e); } });
  const view = mountTest(t, () => provide(Ctx, 2, () => {
    const btn = h.button({
      onclick: async () => {
        try { useContext(Ctx); } catch (e) { codes.push(codeOf(e)); }
        await Promise.resolve();
        try { useContext(Ctx); } catch (e) { codes.push(codeOf(e)); }
      },
    }, 'go');
    return h.div(null, btn, h.span(null, () => { try { useContext(Ctx); return 'ok'; } catch (e) { return codeOf(e) ?? ''; } }));
  }));
  view.root.querySelector('button')!.click();
  await settled();
  assert.deepEqual(codes, ['CONTEXT_OUTSIDE_OWNER', 'CONTEXT_OUTSIDE_OWNER']);
  assert.equal(c(), 'CONTEXT_OUTSIDE_OWNER');
  assert.equal(view.root.querySelector('span')!.textContent, 'CONTEXT_OUTSIDE_OWNER');
});

test('B13.4 structural lookup: later rows, later branches, effect runs, onMount and catchError fallbacks see the value', (t) => {
  const Ctx = createContext<string>('Ctx');
  const list = signal<number[]>([]);
  const on = signal(false);
  const fail = signal(false);
  const seen: string[] = [];
  mountTest(t, () => provide(Ctx, 'v', () => {
    effect(() => { list(); seen.push(`effect ${useContext(Ctx)}`); });
    onMount(() => { seen.push(`mount ${useContext(Ctx)}`); });
    return h.div(null,
      each(list, { key: (x) => x, render: () => { seen.push(`row ${useContext(Ctx)}`); return h.i(null); } }),
      show(on, () => { seen.push(`branch ${useContext(Ctx)}`); return h.b(null); }),
      catchError(() => h.p(null, () => { if (fail()) throw new Error('x'); return 'ok'; }),
        () => { seen.push(`fallback ${useContext(Ctx)}`); return 'failed'; }));
  }));
  list.set([1]); on.set(true); fail.set(true); flush();
  assert.deepEqual(seen.sort(), ['branch v', 'effect v', 'effect v', 'fallback v', 'mount v', 'row v'].sort());
});

test('B13.5 the value is stored as-is (same object, a provided signal stays live)', (t) => {
  const Ctx = createContext<{ n: () => number }>('Ctx');
  const n = signal(1);
  const value = { n };
  let got: unknown;
  const Leaf = component(function Leaf(): Node { const v = useContext(Ctx); got = v; return h.p(null, () => v.n()); });
  const view = mountTest(t, () => provide(Ctx, value, () => Leaf()));
  assert.equal(got, value);
  n.set(2); flush();
  assert.equal(view.root.textContent, '2');
});

test('B13.6 contexts compare by identity, not by name', (t) => {
  const A = createContext<string>('Same');
  const B = createContext<string>('Same', 'b-default');
  let got: string | undefined;
  mountTest(t, () => provide(A, 'a', () => { got = useContext(B); return h.i(null); }));
  assert.equal(got, 'b-default');
});

// ================================================================ B14 components

test('B14.1 the body runs untracked in region <Name>; the owner path shows the parent', () => {
  const cap = capture();
  const s = signal(1, { debugName: 'count' });
  const Child = component(function Child(): Node { s(); return h.i(null); });
  const Parent = component(function Parent(): Node { return h.div(null, Child()); });
  let runs = 0;
  const unmount = withTarget((target) => mount(() => { effect(() => { runs++; Parent(); }); return h.div(null); }, target));
  flush();
  s.set(2); flush();
  cap.stop();
  unmount();
  assert.equal(runs, 1, 'a component called in an effect run does not subscribe the effect');
  const d = cap.diags.find((x) => x.code === 'STRICT_READ_UNTRACKED')!;
  assert.match(d.message, /read directly in <Child>/);
  assert.match(d.ownerPath, /<Parent> › <Child>/);
});

test('B14.1 an unnamed component runs in region <Anonymous>', () => {
  const cap = capture();
  const s = signal(1, { debugName: 'anon' });
  const C = component(() => { s(); return h.i(null); });
  const unmount = mount(() => C(), document.createElement('div'));
  cap.stop();
  unmount();
  assert.match(cap.diags[0]!.message, /read directly in <Anonymous>/);
});

test('B14.1 a component called outside any owner reports NO_OWNER; inside a computed it throws OWNED_IN_DERIVATION', () => {
  const cap = capture();
  const C = component(function Lonely(): Node { return h.i(null); });
  C();
  cap.stop();
  assert.deepEqual(cap.codes(), ['NO_OWNER']);
  const c = computed(() => C());
  assert.throws(() => c(), (e) => codeOf(e) === 'OWNED_IN_DERIVATION');
});

test('B14.1 a component owner is a child of the current owner (disposed with its parent)', (t) => {
  const on = signal(true);
  const log: string[] = [];
  const C = component(function C(): Node { onMount(() => () => log.push('cleanup')); return h.i(null); });
  mountTest(t, () => h.div(null, show(on, () => C())));
  on.set(false); flush();
  assert.deepEqual(log, ['cleanup']);
});

test('B14.2 COMPONENT_RETURN_NOT_NODE for null, undefined and arrays', () => {
  for (const [ret, type] of [[null, 'null'], [undefined, 'undefined'], [[h.i(null)], 'object']] as const) {
    const Bad = component(function Bad(): Node { return ret as unknown as Node; });
    let err: unknown;
    const cap = capture();
    try { mount(() => Bad(), document.createElement('div')); } catch (e) { err = e; }
    cap.stop();
    assert.equal(codeOf(err), 'COMPONENT_RETURN_NOT_NODE');
    assert.match((err as Error).message, new RegExp(`Component <Bad> returned ${type}, not a Node`));
  }
});

test('B14.3 props are passed by reference: not copied, frozen or proxied', (t) => {
  const props = { a: 1, list: [1] };
  let got: unknown;
  const C = component(function C(p: { a: number; list: number[] }): Node { got = p; p.a = 2; return h.i(null); });
  mountTest(t, () => C(props));
  assert.equal(got, props);
  assert.equal(props.a, 2);
  assert.equal(Object.isFrozen(props), false);
});

test('B14.4 dev owner bookkeeping writes nothing to the DOM; inspect(node) gives the owner path', (t) => {
  let el!: HTMLElement;
  const C = component(function Card(): Node { return (el = h.div(null)); });
  mountTest(t, () => C());
  assert.equal(el.attributes.length, 0);
  assert.equal(el.outerHTML, '<div></div>');
  const info = (globalThis as unknown as { __JASNO__: { inspect(n: Node): { ownerPath: string } } }).__JASNO__.inspect(el);
  assert.match(info.ownerPath, /<Card>$/);
});

// ================================================================ B15.1 / B15.2 order

test('B15.1 props are applied before children (textContent prop then a child); textContent is not a jasno prop', () => {
  const cap = capture();
  const el = h.div({ textContent: 'p' } as Any, 'c');
  cap.stop();
  assert.equal(el.textContent, 'pc');
  assert.deepEqual(cap.codes(), ['UNKNOWN_PROP']); // props are closed (ADR-02): applied anyway, reported
});

test('B15.2 type is applied first, then the other keys in object order', (t) => {
  const log: string[] = [];
  const tap = (k: string, v: string) => () => { log.push(k); return v; };
  mountTest(t, () => h.label(null, 'x', h.input({ title: tap('title', 't'), value: tap('value', 'v'), type: tap('type', 'text'), name: tap('name', 'n') })));
  assert.deepEqual(log, ['type', 'title', 'value', 'name']);
});

test('B15.2 value set after type: a checkbox created with value then type keeps the value', (t) => {
  const view = mountTest(t, () => h.label(null, 'x', h.input({ value: 'yes', checked: true, type: 'checkbox' })));
  const input = view.root.querySelector('input')!;
  assert.equal(input.type, 'checkbox');
  assert.equal(input.value, 'yes');
  assert.equal(input.checked, true);
});

test('B15.1 select value and selectedIndex are deferred until options exist (static and live)', (t) => {
  const idx = signal(2);
  const view = mountTest(t, () => h.label(null, 'x',
    h.select({ value: 'b' }, h.option({ value: 'a' }, 'A'), h.option({ value: 'b' }, 'B')),
    h.select({ selectedIndex: idx }, h.option(null, 'A'), h.option(null, 'B'), h.option(null, 'C'))));
  const [s1, s2] = view.root.querySelectorAll('select');
  assert.equal(s1!.value, 'b');
  assert.equal(s2!.selectedIndex, 2);
  idx.set(0); flush();
  assert.equal(s2!.selectedIndex, 0);
});

// ================================================================ B15.3 listeners and bindings

test('B15.3 on* adds a listener for the rest of the key (custom event names too); a non-function on* value adds nothing', (t) => {
  const log: string[] = [];
  const view = mountTest(t, () => h.div({ ['onmy-event' as string]: (e: Event) => log.push(e.type), onclick: null } as Any));
  const el = view.root.firstElementChild!;
  el.dispatchEvent(new Event('my-event'));
  el.dispatchEvent(new Event('click'));
  assert.deepEqual(log, ['my-event']);
});

test('B15.3 a handler is never live: the function is called per event, not at creation', (t) => {
  let calls = 0;
  const view = mountTest(t, () => h.button({ onclick: () => { calls++; } }, 'b'));
  assert.equal(calls, 0);
  view.root.querySelector('button')!.click();
  assert.equal(calls, 1);
});

test('B15.3 a binding whose new value is Object.is-equal to the last applied one does not touch the DOM', (t) => {
  const n = signal(1);
  const view = mountTest(t, () => h.div({ title: () => (n() > 0 ? 'pos' : 'neg'), 'aria-label': () => (n() > 0 ? 'p' : 'n') }, () => (n() > 0 ? 'P' : 'N')));
  const el = view.root.firstElementChild as HTMLElement;
  el.title = 'external';
  el.setAttribute('aria-label', 'external');
  (el.firstChild as Text).data = 'external';
  n.set(2); flush();
  assert.equal(el.title, 'external');
  assert.equal(el.getAttribute('aria-label'), 'external');
  assert.equal(el.textContent, 'external');
  n.set(-1); flush();
  assert.equal(el.title, 'neg');
  assert.equal(el.textContent, 'N');
});

test('B15.3 NaN is Object.is-equal to NaN (skipped); +0 and -0 differ (applied)', (t) => {
  const n = signal(0);
  const view = mountTest(t, () => h.div({ title: () => (n(), NaN) as unknown as string, tabIndex: () => (n() === 0 ? 0 : -0) }));
  const el = view.root.firstElementChild as HTMLElement;
  const title = spy(el, 'title');
  const tab = spy(el, 'tabIndex');
  n.set(1); flush();
  assert.deepEqual(title.writes, []);
  assert.equal(tab.writes.length, 1);
});

test('B15.3 a live prop binding re-runs in phase (a), before effects of the same round', (t) => {
  const s = signal('a');
  const seen: string[] = [];
  mountTest(t, () => {
    const el = h.div({ title: s });
    effect(() => { s(); seen.push(el.title); });
    return el;
  });
  s.set('b'); flush();
  assert.deepEqual(seen, ['a', 'b']);
});

// ================================================================ B15.4 application

test('B15.4 class string sets className; a live class restores "" on undefined; class object toggles each key', (t) => {
  const cls = signal<string | undefined>('a b');
  const on = signal(true);
  const view = mountTest(t, () => h.div(null, h.p({ class: cls }), h.p({ class: { x: on, y: () => !on(), z: true, w: false } })));
  const [p1, p2] = view.root.querySelectorAll('p');
  assert.equal(p1!.className, 'a b');
  assert.equal(p2!.className, 'x z');
  cls.set(undefined); on.set(false); flush();
  assert.equal(p1!.className, '');
  assert.equal(p2!.className, 'z y');
});

test('B15.4 class object keeps classes it does not own', (t) => {
  const on = signal(true);
  const view = mountTest(t, () => h.p({ class: { x: on } }));
  const p = view.root.querySelector('p')!;
  p.classList.add('ext');
  on.set(false); flush();
  assert.equal(p.className, 'ext');
});

test('B15.4 style: --custom with setProperty, others with style[key]; null/undefined remove (static and live)', (t) => {
  const c = signal<string | null | undefined>('red');
  const gap = signal<string | null | undefined>('4px');
  const view = mountTest(t, () => h.div({ style: { color: c, '--gap': gap, marginTop: '2px', paddingTop: undefined, '--none': null } }));
  const el = view.root.firstElementChild as HTMLElement;
  assert.equal(el.style.color, 'red');
  assert.equal(el.style.getPropertyValue('--gap'), '4px');
  assert.equal(el.style.marginTop, '2px');
  assert.equal(el.style.getPropertyValue('--none'), '');
  c.set(null); gap.set(undefined); flush();
  assert.equal(el.style.color, '');
  assert.equal(el.style.getPropertyValue('--gap'), '');
  c.set('blue'); gap.set('1px'); flush();
  assert.equal(el.style.color, 'blue');
  assert.equal(el.style.getPropertyValue('--gap'), '1px');
  c.set(undefined); flush();
  assert.equal(el.style.color, '');
});

test('B15.4 aria-*: String(value), booleans become "true"/"false" (false is not removed), null/undefined remove', (t) => {
  const v = signal<boolean | number | string | null | undefined>(false);
  const view = mountTest(t, () => h.div({ 'aria-expanded': v, 'aria-level': 3, 'aria-hidden': undefined }));
  const el = view.root.firstElementChild!;
  assert.equal(el.getAttribute('aria-expanded'), 'false');
  assert.equal(el.getAttribute('aria-level'), '3');
  assert.equal(el.hasAttribute('aria-hidden'), false);
  v.set(0); flush();
  assert.equal(el.getAttribute('aria-expanded'), '0');
  v.set(null); flush();
  assert.equal(el.hasAttribute('aria-expanded'), false);
  v.set(true); flush();
  assert.equal(el.getAttribute('aria-expanded'), 'true');
  v.set(undefined); flush();
  assert.equal(el.hasAttribute('aria-expanded'), false);
});

test('B15.4 data-*: strings and numbers as String, true as "", false/null/undefined remove', (t) => {
  const v = signal<string | number | boolean | null | undefined>(0);
  const view = mountTest(t, () => h.div({ 'data-a': v, 'data-b': '', 'data-c': true, 'data-d': false }));
  const el = view.root.firstElementChild as HTMLElement;
  assert.equal(el.getAttribute('data-a'), '0');
  assert.equal(el.getAttribute('data-b'), '');
  assert.equal(el.getAttribute('data-c'), '');
  assert.equal(el.hasAttribute('data-d'), false);
  for (const [x, want] of [[true, ''], [false, null], ['s', 's'], [null, null], [7, '7'], [undefined, null]] as const) {
    v.set(x); flush();
    assert.equal(el.getAttribute('data-a'), want, `data-a for ${String(x)}`);
  }
});

test('B15.4 other keys assign the element property (hidden, tabIndex, htmlFor, id)', (t) => {
  const view = mountTest(t, () => h.div(null, h.label({ htmlFor: 'i', id: 'l' }, 'L'), h.input({ id: 'i', hidden: true, tabIndex: 3 })));
  const input = view.root.querySelector('input')!;
  assert.equal(view.root.querySelector('label')!.getAttribute('for'), 'i');
  assert.equal(input.hidden, true);
  assert.equal(input.tabIndex, 3);
});

test('B15.4 value, checked and selectedIndex are assigned only when they differ from the element\'s current value', (t) => {
  const text = signal('a');
  const on = signal(true);
  const idx = signal(0);
  const view = mountTest(t, () => h.label(null, 'x',
    h.input({ value: text }),
    h.input({ type: 'checkbox', checked: on }),
    h.select({ selectedIndex: idx }, h.option(null, 'A'), h.option(null, 'B'))));
  const [input, box] = view.root.querySelectorAll('input');
  const select = view.root.querySelector('select')!;
  const wv = spy(input!, 'value'), wc = spy(box!, 'checked'), ws = spy(select, 'selectedIndex');
  input!.value = 'typed';
  box!.checked = false;
  select.selectedIndex = 1;
  wv.writes.length = 0; wc.writes.length = 0; ws.writes.length = 0;
  text.set('typed'); on.set(false); idx.set(1); flush();
  assert.deepEqual([wv.writes, wc.writes, ws.writes], [[], [], []], 'equal to the element value: not assigned');
  text.set('new'); on.set(true); idx.set(0); flush();
  assert.deepEqual([wv.writes, wc.writes, ws.writes], [['new'], [true], [0]]);
});

test('B15.4 value is assigned at creation even when it reads the same: an option with value \'\' keeps it (pilot wizard B1)', (t) => {
  const view = mountTest(t, () => h.label(null, 'Country',
    h.select({ required: true }, h.option({ value: '' }, 'Choose'), h.option({ value: 'nl' }, 'Netherlands'))));
  const select = view.root.querySelector('select')!;
  assert.equal(select.options[0]!.getAttribute('value'), '');
  assert.equal(select.value, '');
  assert.equal(select.validity.valueMissing, true);
});

// ================================================================ B15.12 two-way binding

test('B15.12 bindValue: value live, set on input; one binding serves input, textarea and select; a signal alone uses its set', (t) => {
  const text = signal('a');
  const picked = signal('x');
  const view = mountTest(t, () => h.label(null, 'Name',
    h.input({ ...bindValue(text) }),
    h.textarea({ ...bindValue(text, text.set) }),
    h.select({ ...bindValue(picked, picked.set) }, h.option({ value: 'x' }, 'X'), h.option({ value: 'y' }, 'Y'))));
  const input = view.root.querySelector('input')!;
  const area = view.root.querySelector('textarea')!;
  const select = view.root.querySelector('select')!;
  assert.deepEqual([input.value, area.value, select.value], ['a', 'a', 'x']);
  input.value = 'typed';
  input.dispatchEvent(new Event('input'));
  flush();
  assert.equal(text(), 'typed');
  assert.equal(area.value, 'typed');
  select.value = 'y';
  select.dispatchEvent(new Event('input')); // HTML's select update notification: input, then change
  flush();
  assert.equal(picked(), 'y');
  text.set('outside');
  flush();
  assert.deepEqual([input.value, area.value], ['outside', 'outside']);
});

test('B15.12 bindNumber: \'\' and NaN set undefined, undefined shows as \'\', the field\'s text is kept while it means the current value', (t) => {
  const n = signal<number | undefined>(undefined);
  const view = mountTest(t, () => h.label(null, 'Qty', h.input({ type: 'number', ...bindNumber(n, n.set) })));
  const input = view.root.querySelector('input')!;
  assert.equal(input.value, '');
  const type = (v: string): void => { input.value = v; input.dispatchEvent(new Event('input')); flush(); };
  type('12');
  assert.equal(n(), 12);
  const log = spy(input, 'value');
  input.value = '1.50';
  log.writes.length = 0; // the test's own assignment
  input.dispatchEvent(new Event('input'));
  flush();
  assert.equal(n(), 1.5);
  assert.deepEqual(log.writes, [], 'not rewritten to "1.5" under the caret');
  assert.equal(input.value, '1.50');
  type('');
  assert.equal(n(), undefined);
  type('abc'); // happy-dom keeps the text, browsers read \'\' for it: NaN either way
  assert.equal(n(), undefined);
  log.writes.length = 0;
  n.set(3);
  flush();
  assert.deepEqual(log.writes, ['3']);
  n.set(undefined);
  flush();
  assert.equal(input.value, '');
  type('2.0');
  n.set(7);
  flush();
  n.set(2);
  flush();
  assert.equal(input.value, '2', 'the remembered text is forgotten once another value was shown');
});

test('B15.12 bindChecked: checked live, set on change', (t) => {
  const on = signal(false);
  const view = mountTest(t, () => h.label(null, h.input({ type: 'checkbox', ...bindChecked(on, on.set) }), 'On'));
  const box = view.root.querySelector('input')!;
  assert.equal(box.checked, false);
  box.click();
  flush();
  assert.equal(on(), true);
  on.set(false);
  flush();
  assert.equal(box.checked, false);
});

// ================================================================ B15.5 undefined

test('B15.5 undefined is skipped at creation; a later live undefined restores the creation value', (t) => {
  const tab = signal<number | undefined>(undefined);
  const hid = signal<boolean | undefined>(true);
  const view = mountTest(t, () => h.div(null, h.button({ tabIndex: tab }, 'b'), h.p({ hidden: hid, title: undefined })));
  const btn = view.root.querySelector('button')!;
  const p = view.root.querySelector('p')!;
  const creationTab = document.createElement('button').tabIndex;
  assert.equal(btn.tabIndex, creationTab);
  assert.equal(p.hasAttribute('title'), false);
  assert.equal(p.hidden, true);
  tab.set(5); flush();
  assert.equal(btn.tabIndex, 5);
  tab.set(undefined); hid.set(undefined); flush();
  assert.equal(btn.tabIndex, creationTab);
  assert.equal(p.hidden, false);
});

test('B15.5 a live input value that becomes undefined restores the creation value (not the last user value)', (t) => {
  const v = signal<string | undefined>('x');
  const view = mountTest(t, () => h.label(null, 'n', h.input({ value: v })));
  const input = view.root.querySelector('input')!;
  input.value = 'typed';
  v.set(undefined); flush();
  assert.equal(input.value, '');
});

test('B15.5: a live href that becomes undefined removes the href attribute (no link to the current page)', (t) => {
  const href = signal<string | undefined>('/x');
  const view = mountTest(t, () => h.a({ href }, 'Go'));
  const a = view.root.querySelector('a')!;
  href.set(undefined); flush();
  assert.equal(a.hasAttribute('href'), false, 'restoring the creation value should leave no href attribute (ADR-02: undefined avoids href="")');
});

// ================================================================ B15.6 children

test('B15.6 bigints and numbers print; nested arrays flatten; booleans and nullish render nothing', (t) => {
  const view = mountTest(t, () => h.p(null, 10n, [0, [NaN, [true, null, undefined, false]]], -0));
  assert.equal(view.root.textContent, '100NaN0');
});

test('B15.6 a DocumentFragment appends its children (no NODE_MOVED)', (t) => {
  const view = mountTest(t, () => {
    const f = document.createDocumentFragment();
    f.append(h.b(null, 'a'), 'b');
    return h.p(null, f, 'c');
  });
  assert.equal(view.root.innerHTML, '<p><b>a</b>bc</p>');
});

test('B15.6 a Node that already has a parent is moved and reports NODE_MOVED (element and text node)', () => {
  const cap = capture();
  const other = document.createElement('div');
  const b = document.createElement('b');
  const txt = document.createTextNode('t');
  other.append(b, txt);
  let p!: HTMLElement;
  const C = component(function Host(): Node { return (p = h.p(null, b, txt)); });
  const unmount = mount(() => C(), document.createElement('div'));
  cap.stop();
  unmount();
  assert.equal(b.parentNode, p);
  assert.equal(txt.parentNode, p);
  assert.equal(other.childNodes.length, 0);
  assert.deepEqual(cap.codes(), ['NODE_MOVED']);
  assert.equal(cap.diags[0]!.count, 2, 'same call site: deduplicated, counted twice');
  assert.match(cap.diags[0]!.message, /<b> already had a parent and was moved into .*<Host>/);
});

test('B15.6 function children: String(v); nothing for null/undefined/booleans; live', (t) => {
  const v = signal<unknown>(0);
  const view = mountTest(t, () => h.p(null, 'a', () => v() as string, 'z'));
  const p = view.root.querySelector('p')!;
  const seen: string[] = [];
  for (const x of [0, true, 'x', null, 5n, false, undefined, NaN]) { v.set(x); flush(); seen.push(p.textContent!); }
  assert.deepEqual(seen, ['a0z', 'az', 'axz', 'az', 'a5z', 'az', 'az', 'aNaNz']);
});

test('B15.6 NODE_IN_TEXT_BINDING on a later update is routed to the nearest catchError', (t) => {
  const node = signal(false);
  const view = mountTest(t, () => h.div(null, catchError(
    () => h.p(null, () => (node() ? h.b(null) : 'text') as unknown as string),
    (e) => `caught ${codeOf(e)}`)));
  assert.equal(view.root.textContent, 'text');
  node.set(true); flush();
  assert.equal(view.root.textContent, 'caught NODE_IN_TEXT_BINDING');
});

// ================================================================ B15.7 handler wrapper

test('B15.7 handlers dispatched during setup: untracked, no owner (NO_OWNER for effect), no strict label (no LEAK/STRICT diagnostics)', () => {
  const cap = capture();
  const s = signal(1, { debugName: 's' });
  let stop = () => {};
  const C = component(function Setup(): Node {
    const b = h.button({
      onclick: () => {
        s();
        const id = setTimeout(() => {}, 0); clearTimeout(id);
        stop = effect(() => { s(); });
      },
    }, 'b');
    b.click();
    return b;
  });
  const unmount = withTarget((target) => mount(() => C(), target));
  flush();
  cap.stop();
  stop();
  unmount();
  assert.deepEqual(cap.codes(), ['NO_OWNER']);
});

test('B15.7 a handler dispatched inside an effect run is not tracked by the effect and its writes are silent', (t) => {
  const a = signal(0), b = signal(0), w = signal(0);
  let runs = 0;
  const view = mountTest(t, () => {
    const btn = h.button({ onclick: () => { b(); w.set(w() + 1); } }, 'x');
    const out = h.div(null, btn, h.span(null, w));
    effect(() => { a(); runs++; btn.click(); });
    return out;
  });
  assert.equal(runs, 1);
  b.set(1); flush();
  assert.equal(runs, 1, 'b was read in the handler, not by the effect');
  assert.equal(view.root.querySelector('span')!.textContent, '1');
});

test('B15.7 a handler dispatched during a derivation may write (writes in handlers are allowed)', () => {
  const s = signal(0);
  const btn = h.button({ onclick: () => s.set(s() + 1) }, 'x');
  const c = computed(() => { btn.click(); return 1; });
  assert.doesNotThrow(() => c());
  assert.equal(s(), 1);
});

test('B15.7 a returned promise is tracked by settled(); a promise started but not returned is invisible', async (t) => {
  const d1 = deferred<void>();
  const d2 = deferred<void>();
  let done = false;
  const view = mountTest(t, () => h.div(null,
    h.button({ id: 'r', onclick: () => d1.promise.then(() => { done = true; }) }, 'r'),
    h.button({ id: 'n', onclick: () => { void d2.promise; } }, 'n')));
  (view.root.querySelector('#n') as HTMLElement).click();
  await settled({ timeout: 200 });
  (view.root.querySelector('#r') as HTMLElement).click();
  setTimeout(() => d1.resolve(), 5);
  await settled();
  assert.equal(done, true);
});

test('B15.7 a rejected handler promise fails settled() with UNCAUGHT_ERROR', async () => {
  const view = mountTest({ after() {} }, () => h.button({ onclick: async () => { throw new Error('boom'); } }, 'x'));
  view.root.querySelector('button')!.click();
  await assert.rejects(settled(), (e) => codeOf(e) === 'UNCAUGHT_ERROR' && ((e as Error).cause as Error).message === 'boom');
  view.dispose();
});

test('B15.7 SUBMIT_NOT_PREVENTED: reported without preventDefault; not with preventDefault, an action attribute or method dialog', () => {
  const cap = capture();
  const forms = withTarget((target) => {
    const f = {
      bare: h.form({ onsubmit: () => {} }, h.button({ type: 'submit' }, 'Go')),
      prevented: h.form({ onsubmit: (e) => e.preventDefault() }, h.button({ type: 'submit' }, 'Go')),
      action: h.form({ action: '/x', onsubmit: () => {} }, h.button({ type: 'submit' }, 'Go')),
      dialog: h.form({ method: 'dialog', onsubmit: () => {} }, h.button({ type: 'submit' }, 'Go')),
      asyncPrevented: h.form({ onsubmit: async (e) => { e.preventDefault(); await Promise.resolve(); } }, h.button({ type: 'submit' }, 'Go')),
    };
    const unmount = mount(() => h.div(null, ...Object.values(f)), target);
    for (const [k, form] of Object.entries(f)) { cap.diags.length = 0; form.dispatchEvent(new Event('submit', { cancelable: true })); (f as Any)[k] = cap.codes(); }
    unmount();
    return f as unknown as Record<string, string[]>;
  });
  cap.stop();
  assert.deepEqual(forms, { bare: ['SUBMIT_NOT_PREVENTED'], prevented: [], action: [], dialog: [], asyncPrevented: [] });
});

test('B15.7 SUBMIT_NOT_PREVENTED when preventDefault happens only after an await', async () => {
  const cap = capture();
  const form = h.form({ onsubmit: async (e) => { await Promise.resolve(); e.preventDefault(); } }, 'x');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await tick();
  cap.stop();
  assert.deepEqual(cap.codes(), ['SUBMIT_NOT_PREVENTED']);
});

async function enterCase(opts: {
  target: () => HTMLElement; wrap?: (input: HTMLElement, target: HTMLElement) => Node;
  viaFlush?: boolean; prevent?: boolean; composing?: boolean; key?: string; type?: 'keydown' | 'keyup';
}): Promise<string[]> {
  const cap = capture();
  const go = signal(false);
  let codes: string[] = [];
  await withTargetAsync(async (host) => {
    const tgt = opts.target();
    const handler = (e: KeyboardEvent) => {
      if (opts.prevent) e.preventDefault();
      if (opts.viaFlush) go.set(true); else tgt.focus();
    };
    const input = h.input({ 'aria-label': 'field', [`on${opts.type ?? 'keydown'}`]: handler } as Any);
    const unmount = mount(() => h.div(null,
      opts.wrap ? opts.wrap(input, tgt) : h.div(null, input, tgt),
      show(go, () => { onMount(() => tgt.focus()); return ''; })), host);
    flush();
    input.focus();
    cap.diags.length = 0;
    input.dispatchEvent(new KeyboardEvent(opts.type ?? 'keydown', { key: opts.key ?? 'Enter', cancelable: true, isComposing: !!opts.composing }));
    await tick();
    codes = cap.codes();
    unmount();
  });
  cap.stop();
  return codes;
}

test('B15.7 KEY_ACTIVATES_NEW_FOCUS: Enter moved focus to a button in the handler or in the flush it scheduled', async () => {
  assert.deepEqual(await enterCase({ target: () => h.button(null, 'Save') }), ['KEY_ACTIVATES_NEW_FOCUS']);
  assert.deepEqual(await enterCase({ target: () => h.button(null, 'Save'), viaFlush: true }), ['KEY_ACTIVATES_NEW_FOCUS']);
});

test('B15.7 KEY_ACTIVATES_NEW_FOCUS targets: a[href], summary, textarea, input with a form owner', async () => {
  assert.deepEqual(await enterCase({ target: () => h.a({ href: '/x' }, 'Link') }), ['KEY_ACTIVATES_NEW_FOCUS']);
  assert.deepEqual(await enterCase({ target: () => h.summary(null, 'More') }), ['KEY_ACTIVATES_NEW_FOCUS']);
  assert.deepEqual(await enterCase({ target: () => h.textarea({ 'aria-label': 't' }) }), ['KEY_ACTIVATES_NEW_FOCUS']);
  assert.deepEqual(await enterCase({
    target: () => h.input({ 'aria-label': 'other' }),
    wrap: (input, tgt) => h.form({ onsubmit: (e) => e.preventDefault() }, input, tgt),
  }), ['KEY_ACTIVATES_NEW_FOCUS']);
});

test('B15.7 KEY_ACTIVATES_NEW_FOCUS not reported: preventDefault, composing, other keys, keyup, input without form, select, a without href', async () => {
  const btn = () => h.button(null, 'Save');
  assert.deepEqual(await enterCase({ target: btn, prevent: true }), [], 'prevented');
  assert.deepEqual(await enterCase({ target: btn, composing: true }), [], 'composing');
  assert.deepEqual(await enterCase({ target: btn, key: 'Escape' }), [], 'Escape');
  assert.deepEqual(await enterCase({ target: btn, type: 'keyup' }), [], 'keyup');
  assert.deepEqual(await enterCase({ target: () => h.input({ 'aria-label': 'other' }) }), [], 'input without form');
  assert.deepEqual(await enterCase({ target: () => h.select({ 'aria-label': 's' }, h.option(null, 'A')) }), [], 'select');
  assert.deepEqual(await enterCase({ target: () => h.a({ tabIndex: 0 }, 'x') }), [], 'a without href');
});

test('B15.7 KEY_ACTIVATES_NEW_FOCUS not reported when the flush moves focus back to the original element', async () => {
  const cap = capture();
  const go = signal(false);
  await withTargetAsync(async (host) => {
    const btn = h.button(null, 'Save');
    const input = h.input({ 'aria-label': 'f', onkeydown: () => { btn.focus(); go.set(true); } });
    const unmount = mount(() => h.div(null, input, btn, show(go, () => { onMount(() => input.focus()); return ''; })), host);
    flush();
    input.focus();
    cap.diags.length = 0;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await tick();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.codes(), []);
});

test('(g) Keys: with a cancelable keydown, a handler that calls preventDefault() is not reported', async () => {
  const cap = capture();
  await withTargetAsync(async (host) => {
    const btn = h.button(null, 'Save');
    const input = h.input({ 'aria-label': 'f', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.focus(); } } });
    const unmount = mount(() => h.div(null, input, btn), host);
    flush();
    input.focus();
    cap.diags.length = 0;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); // as design.md (g) "Keys" writes it
    await tick();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.codes(), [], 'correct code (preventDefault in the branch) must not warn with the documented dispatch');
});

test('(g) Keys: dispatchEvent(keydown Enter), then await a microtask, runs KEY_ACTIVATES_NEW_FOCUS', async () => {
  const cap = capture();
  const go = signal(false);
  let codes: string[] = [];
  await withTargetAsync(async (host) => {
    const btn = h.button(null, 'Save');
    const input = h.input({ 'aria-label': 'f', onkeydown: () => go.set(true) });
    const unmount = mount(() => h.div(null, input, btn, show(go, () => { onMount(() => btn.focus()); return ''; })), host);
    flush();
    input.focus();
    cap.diags.length = 0;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await Promise.resolve();
    codes = cap.codes();
    unmount();
  });
  cap.stop();
  assert.deepEqual(codes, ['KEY_ACTIVATES_NEW_FOCUS']);
});

// ================================================================ B15.8 UNKNOWN_PROP

test('B15.8 an unknown key warns UNKNOWN_PROP and is applied anyway; for/ref/key get key-specific hints', () => {
  const cap = capture();
  const el = h.div({ foo: 1, for: 'x', ref: 1, key: 2 } as Any) as unknown as Any;
  cap.stop();
  assert.equal(el.foo, 1);
  assert.deepEqual(cap.codes(), ['UNKNOWN_PROP', 'UNKNOWN_PROP', 'UNKNOWN_PROP', 'UNKNOWN_PROP']);
  assert.match(cap.diags[0]!.message, /<div> got unknown prop "foo"\./);
  assert.match(cap.diags[1]!.hint, /htmlFor/);
  assert.match(cap.diags[3]!.hint, /each\(/);
});

test('B15.8 unknown on* keys still add the listener', () => {
  const cap = capture();
  const log: string[] = [];
  const el = h.div({ ['onwidget-ready' as string]: () => log.push('ok') } as Any);
  el.dispatchEvent(new Event('widget-ready'));
  cap.stop();
  assert.deepEqual(log, ['ok']);
});

test('B15.8: className (via a cast) reports UNKNOWN_PROP with the class hint', () => {
  const cap = capture();
  const el = h.div({ className: 'x' } as Any);
  cap.stop();
  assert.equal(el.className, 'x', 'applied anyway');
  assert.deepEqual(cap.codes(), ['UNKNOWN_PROP']);
});

test('B15.8: onClick (via a cast) reports UNKNOWN_PROP naming onclick', () => {
  const cap = capture();
  let clicks = 0;
  const el = h.button({ onClick: () => { clicks++; } } as Any, 'x');
  el.click();
  cap.stop();
  assert.equal(clicks, 0);
  assert.deepEqual(cap.codes(), ['UNKNOWN_PROP']);
});

test('B15.8: a misspelled aria-* key (via a cast) reports UNKNOWN_PROP', () => {
  const cap = capture();
  const el = h.button({ 'aria-lable': 'Close' } as Any, 'x');
  cap.stop();
  assert.equal(el.getAttribute('aria-lable'), 'Close');
  assert.deepEqual(cap.codes(), ['UNKNOWN_PROP']);
});

// ================================================================ B15.9 select re-apply

test('B15.9 a select\'s bound value is re-applied when an each() region inside it changes its options', (t) => {
  const pick = signal('b');
  const opts = signal<string[]>([]);
  const view = mountTest(t, () => h.label(null, 'Pick', h.select({ value: pick },
    each(opts, { key: (o) => o, render: (o) => h.option({ value: o }, o) }))));
  const select = view.root.querySelector('select')!;
  opts.set(['a', 'b', 'c']); flush();
  assert.equal(select.value, 'b');
});

test('B15.9 a select\'s bound selectedIndex is re-applied when a show() region inside it changes its children', (t) => {
  const idx = signal(1);
  const ready = signal(false);
  const view = mountTest(t, () => h.label(null, 'Pick', h.select({ selectedIndex: idx },
    show(ready, () => [h.option(null, 'A'), h.option(null, 'B')]))));
  const select = view.root.querySelector('select')!;
  ready.set(true); flush();
  assert.equal(select.selectedIndex, 1);
});

// ================================================================ B15.10 INTERACTIVE_NO_NAME

function nameCodes(view: () => Node, extra?: () => void): string[] {
  const cap = capture();
  const on = signal(false);
  withTarget((target) => {
    const unmount = mount(() => h.div(null, show(on, view)), target);
    on.set(true); flush();
    extra?.();
    unmount();
  });
  cap.stop();
  return cap.codes();
}

test('B15.10 INTERACTIVE_NO_NAME for each listed element without a name', () => {
  const cases: [string, () => Node][] = [
    ['button', () => h.button(null)],
    ['a[href]', () => h.a({ href: '/x' })],
    ['input', () => h.input(null)],
    ['input type=button', () => h.input({ type: 'button' })],
    ['select', () => h.select(null, h.option(null, 'A'))],
    ['textarea', () => h.textarea(null)],
    ['dialog', () => h.dialog(null, 'text is not a dialog name')],
    ['meter', () => h.meter({ value: 0.5 })],
    ['progress', () => h.progress({ value: 0.5 })],
    ['button with aria-labelledby to empty', () => h.div(null, h.span({ id: 'empty-lbl' }), h.button({ 'aria-labelledby': 'empty-lbl' }))],
  ];
  for (const [name, v] of cases) assert.deepEqual(nameCodes(v), ['INTERACTIVE_NO_NAME'], name);
});

test('B15.10 no INTERACTIVE_NO_NAME with a name: text, aria-label, aria-labelledby, title, label (wrap and for), img alt, button value, submit/reset default, hidden', () => {
  const cases: [string, () => Node][] = [
    ['button text', () => h.button(null, 'Save')],
    ['live button text', () => h.button(null, () => 'Save')],
    ['aria-label', () => h.button({ 'aria-label': 'Close' })],
    ['aria-labelledby', () => h.div(null, h.h2({ id: 'dlg-t' }, 'Title'), h.dialog({ 'aria-labelledby': 'dlg-t' }))],
    ['title', () => h.textarea({ title: 'Notes' })],
    ['label wrap', () => h.label(null, 'Name ', h.input(null))],
    ['label for input', () => h.div(null, h.label({ htmlFor: 'nm-i' }, 'Name'), h.input({ id: 'nm-i' }))],
    ['label for select', () => h.div(null, h.label({ htmlFor: 'nm-s' }, 'Pick'), h.select({ id: 'nm-s' }, h.option(null, 'A')))],
    ['label for meter', () => h.div(null, h.label({ htmlFor: 'nm-m' }, 'Load'), h.meter({ id: 'nm-m', value: 0.5 }))],
    ['label for progress', () => h.div(null, h.label({ htmlFor: 'nm-p' }, 'Load'), h.progress({ id: 'nm-p' }))],
    ['img alt child', () => h.a({ href: '/' }, h.img({ alt: 'Home', src: 'x.png' }))],
    ['input button value', () => h.input({ type: 'button', value: 'Go' })],
    ['submit default', () => h.input({ type: 'submit' })],
    ['reset default', () => h.input({ type: 'reset' })],
    ['hidden input', () => h.input({ type: 'hidden' })],
    ['a without href', () => h.a(null)],
  ];
  for (const [name, v] of cases) assert.deepEqual(nameCodes(v), [], name);
});

test('B15.10 INTERACTIVE_NO_NAME is reported once per element (not again after later flushes or moves)', () => {
  const cap = capture();
  const n = signal(0);
  const list = signal([1, 2]);
  withTarget((target) => {
    const unmount = mount(() => h.div(null, h.span(null, n), each(list, { key: (x) => x, render: () => h.button(null) })), target);
    n.set(1); flush();
    list.set([2, 1]); flush();
    n.set(2); flush();
    unmount();
  });
  cap.stop();
  const d = cap.diags.filter((x) => x.code === 'INTERACTIVE_NO_NAME');
  assert.equal(d.length, 1);
  assert.equal(d[0]!.count, 2, 'two elements, one event each');
});

test('B15.10 an element created in one flush and inserted in onMount of that flush is checked', () => {
  const cap = capture();
  withTarget((target) => {
    const unmount = mount(() => {
      const b = h.button(null);
      onMount(() => { target.append(b); return () => b.remove(); });
      return h.div(null);
    }, target);
    flush();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.codes(), ['INTERACTIVE_NO_NAME']);
});

test('B15.10 + B16.3 + B19.1 a static view with a nameless button is name-checked by mountTest\'s flush', () => {
  const view = mountTest({ after() {} }, () => h.div(null, h.button(null)));
  assert.throws(() => view.dispose(), /INTERACTIVE_NO_NAME/);
});

test('B15.10 + B16.3 mount() of static content reports INTERACTIVE_NO_NAME in the first flush', async () => {
  const cap = capture();
  const target = document.createElement('div');
  document.body.append(target);
  const unmount = mount(() => h.div(null, h.button(null)), target);
  await tick();
  flush();
  cap.stop();
  unmount();
  target.remove();
  assert.deepEqual(cap.codes(), ['INTERACTIVE_NO_NAME']);
});

test('B15.10: aria-labelledby to an element named by alt/aria-label counts as a name', () => {
  assert.deepEqual(nameCodes(() => h.div(null, h.img({ id: 'ico-l', alt: 'Close', src: 'x.png' }), h.button({ 'aria-labelledby': 'ico-l' }))), []);
});

// ================================================================ B15.11 svg

test('B15.11 svg: createElementNS; attributes via setAttribute; live values; null/undefined remove; on* listeners', (t) => {
  const d = signal<string | null | undefined>('M0 0');
  const log: string[] = [];
  const view = mountTest(t, () => svg.svg({ viewBox: '0 0 1 1', 'aria-hidden': 'true', width: 0, height: undefined, onclick: (e) => log.push(e.type) },
    svg.path({ d, class: 'p' }), () => 'txt'));
  const s = view.root.querySelector('svg')!;
  const path = view.root.querySelector('path')!;
  assert.equal(s.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(s.getAttribute('viewBox'), '0 0 1 1');
  assert.equal(s.getAttribute('width'), '0');
  assert.equal(s.hasAttribute('height'), false);
  assert.equal(path.getAttribute('class'), 'p');
  assert.equal(s.textContent, 'txt');
  d.set(null); flush();
  assert.equal(path.hasAttribute('d'), false);
  d.set('M1 1'); flush();
  assert.equal(path.getAttribute('d'), 'M1 1');
  d.set(undefined); flush();
  assert.equal(path.hasAttribute('d'), false);
  s.dispatchEvent(new Event('click'));
  assert.deepEqual(log, ['click']);
});

test('B15.11 svg bindings skip Object.is-equal values; svg handlers run untracked with no owner', (t) => {
  const n = signal(1);
  let owner: unknown = 'unset';
  const view = mountTest(t, () => svg.svg({ 'data-x': () => (n() > 0 ? 'p' : 'n'), onclick: () => { n(); try { useContext(createContext<number>('X')); } catch (e) { owner = codeOf(e); } } }));
  const s = view.root.querySelector('svg')!;
  s.setAttribute('data-x', 'ext');
  n.set(2); flush();
  assert.equal(s.getAttribute('data-x'), 'ext');
  s.dispatchEvent(new Event('click'));
  assert.equal(owner, 'CONTEXT_OUTSIDE_OWNER');
});

test('B15.11 svg children follow B15.6: NODE_MOVED for a node with a parent', () => {
  const cap = capture();
  const p = svg.path(null);
  const g = svg.g(null, p);
  svg.svg(null, p);
  cap.stop();
  assert.equal(g.childNodes.length, 0);
  assert.deepEqual(cap.codes(), ['NODE_MOVED']);
});

// ================================================================ B16 mount

test('B16.1 null (and undefined) target throw MOUNT_TARGET_MISSING before the DUPLICATE_RUNTIME check', () => {
  const key = Symbol.for('jasno.runtime');
  const g = globalThis as unknown as Record<symbol, string>;
  const orig = g[key]!;
  g[key] = 'file:///other/jasno/src/dom.ts';
  try {
    assert.throws(() => mount(() => h.p(null), null), (e) => codeOf(e) === 'MOUNT_TARGET_MISSING');
    assert.throws(() => mount(() => h.p(null), document.createElement('div')), (e) => codeOf(e) === 'DUPLICATE_RUNTIME');
  } finally { g[key] = orig; }
});

test('B16.1 the view runs untracked in region <mount>; builders in <mount> › show; target children are replaced', () => {
  const cap = capture();
  const s = signal(1, { debugName: 'm' });
  const on = signal(true);
  const target = document.createElement('div');
  target.append('old', document.createElement('hr'));
  let runs = 0;
  const unmountOuter = withTarget((host) => mount(() => {
    effect(() => { runs++; on(); mount(() => { s(); return h.div(null, show(on, () => { s(); return 'x'; })); }, target); });
    return h.i(null);
  }, host));
  flush();
  s.set(2); flush();
  cap.stop();
  unmountOuter();
  assert.equal(runs, 1, 'the view read is untracked even inside an effect run');
  assert.equal(target.innerHTML, '<div>x</div>');
  const regions = cap.diags.filter((d) => d.code === 'STRICT_READ_UNTRACKED').map((d) => /read directly in (.*?);/.exec(d.message)![1]);
  assert.deepEqual(regions, ['<mount>', '<mount> › show']);
});

test('B16.2 a throwing view: root disposed (effects/onMount never run, bindings dead), target unchanged, same error rethrown', async () => {
  const target = document.createElement('div');
  target.append('old');
  const s = signal(0);
  const log: string[] = [];
  const boom = new Error('view');
  let el!: HTMLElement;
  const cap = capture();
  assert.throws(() => mount(() => {
    effect(() => { s(); log.push('effect'); });
    onMount(() => { log.push('mount'); });
    el = h.p({ title: () => { log.push('binding'); return String(s()); } });
    throw boom;
  }, target), (e) => e === boom);
  log.length = 0;
  s.set(1);
  flush();
  await tick();
  cap.stop();
  assert.deepEqual(log, []);
  assert.equal(el.title, '0');
  assert.equal(target.textContent, 'old');
  assert.deepEqual(cap.codes(), []);
});

test('B16.3 the first flush is a microtask: onMount and first effect runs see the nodes in the document', async () => {
  const seen: string[] = [];
  await withTargetAsync(async (target) => {
    const unmount = mount(() => {
      const p = h.p(null, 'x');
      onMount(() => { seen.push(`mount ${p.isConnected} ${target.contains(p)}`); });
      effect(() => { seen.push(`effect ${p.isConnected}`); });
      return p;
    }, target);
    assert.deepEqual(seen, []);
    await Promise.resolve();
    unmount();
  });
  assert.deepEqual(seen, ['mount true true', 'effect true']);
});

test('B16.4 unmount disposes first (cleanups still see nodes), then removes only the inserted nodes; idempotent', () => {
  withTarget((target) => {
    const log: string[] = [];
    const on = signal(true);
    const unmount = mount(() => {
      const p = h.p(null, 'x');
      onMount(() => () => log.push(`cleanup connected=${p.isConnected}`));
      return h.div(null, p, show(on, () => 'y'));
    }, target);
    flush();
    const extra = document.createElement('aside');
    target.append(extra);
    unmount();
    unmount();
    assert.deepEqual(log, ['cleanup connected=true']);
    assert.deepEqual([...target.childNodes], [extra]);
  });
});

test('B16.4 unmount removes a top-level region whose content changed after mount', () => {
  withTarget((target) => {
    const list = signal([1]);
    const unmount = mount(() => each(list, { key: (x) => x, render: (x) => h.p(null, () => String(x())) }) as Node, target);
    list.set([0, 1, 2]); flush();
    assert.equal(target.textContent, '012');
    unmount();
    assert.equal(target.childNodes.length, 0);
  });
});

test('B16.5 several mounts are independent roots: an error in one, unmounting one, does not affect the other', () => {
  const cap = capture();
  const s = signal(0);
  const [a, b] = [document.createElement('div'), document.createElement('div')];
  document.body.append(a, b);
  const ua = mount(() => h.p(null, () => { if (s() === 1) throw new Error('A'); return `a${s()}`; }), a);
  const ub = mount(() => h.p(null, () => `b${s()}`), b);
  s.set(1); flush();
  assert.equal(b.textContent, 'b1');
  ua();
  s.set(2); flush();
  assert.equal(b.textContent, 'b2');
  ub();
  cap.stop();
  a.remove(); b.remove();
  assert.equal((cap.errors[0] as Error).message, 'A');
});

test('B6.11: mount() inside a derivation throws OWNED_IN_DERIVATION (the mount root is an owner)', () => {
  const target = document.createElement('div');
  let unmount: (() => void) | undefined;
  const c = computed(() => { unmount = mount(() => h.p(null), target); return 1; });
  try {
    assert.throws(() => c(), (e) => codeOf(e) === 'OWNED_IN_DERIVATION');
  } finally { unmount?.(); }
});

// ================================================================ B18 css

test('B18 css: one sheet per template-strings object, adopted once, existing sheets kept, never removed', (t) => {
  const pre = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, pre];
  const make = () => css`.probe-card { color: red; } .probe-card .t { font-weight: 600; }`;
  const before = document.adoptedStyleSheets.length;
  const s1 = make();
  const s2 = make();
  const view = mountTest(t, () => { make(); return h.div({ class: 'probe-card' }); });
  view.dispose();
  assert.equal(s1, s2);
  assert.ok(s1 instanceof CSSStyleSheet);
  assert.equal(s1.cssRules.length, 2);
  assert.equal(document.adoptedStyleSheets.length, before + 1);
  assert.ok(document.adoptedStyleSheets.includes(pre));
  assert.ok(document.adoptedStyleSheets.includes(s1));
});

test('B18 css: identical text at two call sites gives two sheets (identity is the strings object)', () => {
  const a = css`.probe-same { color: blue; }`;
  const b = css`.probe-same { color: blue; }`;
  assert.notEqual(a, b);
  assert.ok(document.adoptedStyleSheets.includes(a) && document.adoptedStyleSheets.includes(b));
});

// ================================================================ extra interactions

test('B14.1 + B5.4 a component called in an effect run may write a signal it created (setup, not the effect)', () => {
  const cap = capture();
  const trigger = signal(0);
  let stop = () => {};
  withTarget((target) => {
    const unmount = mount(() => {
      const host = h.div(null);
      const Tip = component(function Tip(): Node {
        const text = signal('a', { debugName: 'tipText' });
        const el = h.span(null, text);
        text.set('b'); // B5.4: setup may write signals created in the same setup
        return el;
      });
      stop = effect(() => { trigger(); host.replaceChildren(Tip()); });
      return host;
    }, target);
    flush();
    stop();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.codes(), []);
});

test('B14.1 + B5.4 a component called in an effect run that writes a foreign signal reports WRITE_IN_SETUP (region <Name>)', () => {
  const cap = capture();
  const shared = signal(0, { debugName: 'shared' });
  const trigger = signal(0);
  let stop = () => {};
  withTarget((target) => {
    const unmount = mount(() => {
      const host = h.div(null, h.span(null, shared));
      const Bad = component(function Bad(): Node { shared.set(1); return h.i(null); });
      stop = effect(() => { trigger(); host.append(Bad()); });
      return host;
    }, target);
    flush();
    stop();
    unmount();
  });
  cap.stop();
  assert.deepEqual(cap.codes(), ['WRITE_IN_SETUP']);
});

test('B15.7 KEY_ACTIVATES_NEW_FOCUS names both elements and the handler owner path', async () => {
  const cap = capture();
  await withTargetAsync(async (host) => {
    const Editor = component(function Editor(): Node {
      const btn = h.button(null, 'Save');
      return h.div(null, h.input({ 'aria-label': 'f', onkeydown: () => btn.focus() }), btn);
    });
    const unmount = mount(() => Editor(), host);
    flush();
    host.querySelector('input')!.focus();
    host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await tick();
    unmount();
  });
  cap.stop();
  const d = cap.diags.find((x) => x.code === 'KEY_ACTIVATES_NEW_FOCUS')!;
  assert.match(d.message, /The Enter keydown handler in .*<Editor> moved focus from <input> to <button> without preventDefault\(\)/);
});

test('B15.3 + B8.2 a live prop that throws at creation is a setup error caught by the catchError on the stack', (t) => {
  const view = mountTest(t, () => h.div(null, catchError(
    () => h.p({ title: () => { throw new Error('first'); } }),
    (e) => `caught ${(e as Error).message}`)));
  assert.equal(view.root.textContent, 'caught first');
});

test('B15.3 a live class-object key that throws later is routed to catchError; siblings keep updating', (t) => {
  const n = signal(0);
  const view = mountTest(t, () => h.div(null,
    catchError(() => h.p({ class: { odd: () => { if (n() === 2) throw new Error('two'); return n() % 2 === 1; } } }, 'p'), (e) => `caught ${(e as Error).message}`),
    h.span(null, n)));
  n.set(1); flush();
  assert.equal(view.root.querySelector('p')!.className, 'odd');
  n.set(2); flush();
  assert.equal(view.root.textContent, 'caught two2');
});
