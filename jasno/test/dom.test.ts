import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catchError, component, createContext, each, effect, flush, h, match, mount, onMount, provide, show, signal, svg, useContext,
} from '@jasno/core';
import { mountTest, settled } from '@jasno/core/testing';
import { capture, codeOf } from './helpers.ts';

const texts = (root: Element, sel = 'li') => [...root.querySelectorAll(sel)].map((n) => n.textContent);

// ---------------------------------------------------------------- surface regressions (ADR-11)

test('R1: an effect reading a row after an in-place item update sees the new text in the same flush', (t) => {
  const items = signal([{ id: 1, text: 'a' }]);
  const seen: string[] = [];
  mountTest(t, () => {
    const ul = h.ul(null, each(items, { key: (x) => x.id, render: (x) => h.li(null, () => x().text) }));
    effect(() => { items(); seen.push(ul.textContent ?? ''); });
    return ul;
  });
  items.set([{ id: 1, text: 'b' }]);
  flush();
  assert.deepEqual(seen, ['a', 'b']);
});

test('R9: one throwing row among 100, then an update: DOM order equals list order', () => {
  const cap = capture();
  const target = document.createElement('div');
  document.body.append(target);
  let bad = false;
  const list = signal(Array.from({ length: 100 }, (_, i) => i));
  const unmount = mount(() => h.ul(null, each(list, {
    key: (k) => k,
    render: (_x, _i, k) => { if (bad && k === 1000) throw new Error('row 1000'); return h.li(null, String(k)); },
  })), target);
  bad = true;
  const next = [...list()].reverse();
  next.splice(50, 0, 1000);
  list.set(next);
  flush();
  assert.equal((cap.errors[0] as Error).message, 'row 1000');
  assert.deepEqual(texts(target), next.filter((k) => k !== 1000).map(String));
  bad = false;
  const again = [...next].sort((a, b) => (a % 7) - (b % 7) || a - b);
  list.set(again);
  flush();
  cap.stop();
  assert.deepEqual(texts(target), again.map(String), 'the failed row is retried');
  unmount();
  target.remove();
});

// ---------------------------------------------------------------- elements (B15)

test('B15: props, live props, class and style objects, aria and data attributes', (t) => {
  const on = signal(true);
  const label = signal<string | undefined>('x');
  const view = mountTest(t, () => h.div({
    id: 'a', title: label, class: { on, off: () => !on() }, style: { color: () => (on() ? 'red' : null), '--gap': '2px' },
    'aria-pressed': on, 'data-state': () => (on() ? 'open' : false),
  }, 'text'));
  const el = view.root.firstElementChild as HTMLElement;
  assert.equal(el.id, 'a');
  assert.equal(el.className, 'on');
  assert.equal(el.getAttribute('aria-pressed'), 'true');
  assert.equal(el.getAttribute('data-state'), 'open');
  assert.equal(el.style.color, 'red');
  assert.equal(el.style.getPropertyValue('--gap'), '2px');
  on.set(false); label.set(undefined); flush();
  assert.equal(el.className, 'off');
  assert.equal(el.getAttribute('aria-pressed'), 'false');
  assert.equal(el.hasAttribute('data-state'), false);
  assert.equal(el.style.color, '');
  assert.equal(el.title, '', 'undefined restores the creation value');
});

test('B15.4 value is assigned only when it differs (the caret stays put); select value is deferred', (t) => {
  const text = signal('hello');
  const pick = signal('b');
  const view = mountTest(t, () => h.div(null,
    h.label(null, 'Name', h.input({ value: text, oninput: (e) => text.set(e.currentTarget.value) })),
    h.label(null, 'Pick', h.select({ value: pick }, h.option({ value: 'a' }, 'A'), h.option({ value: 'b' }, 'B')))));
  const input = view.root.querySelector('input')!;
  const select = view.root.querySelector('select')!;
  assert.equal(input.value, 'hello');
  assert.equal(select.value, 'b');
  input.value = 'hello!';
  input.setSelectionRange(2, 2);
  input.dispatchEvent(new Event('input'));
  flush();
  assert.equal(input.selectionStart, 2);
});

test('B15.6 children: null/booleans render nothing, numbers print, function children are live text', (t) => {
  const n = signal(1);
  const view = mountTest(t, () => h.p(null, null, false, 'a', 2, [' b', [' c']], () => ` n=${n()}`, () => null));
  assert.equal(view.root.textContent, 'a2 b c n=1');
  n.set(2); flush();
  assert.equal(view.root.textContent, 'a2 b c n=2');
});

test('B15.11 svg(): attributes with setAttribute, live when a function', (t) => {
  const d = signal('M0 0');
  const view = mountTest(t, () => svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d, 'stroke-width': 2 })));
  const path = view.root.querySelector('path')!;
  assert.equal(path.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(path.getAttribute('stroke-width'), '2');
  d.set('M1 1'); flush();
  assert.equal(path.getAttribute('d'), 'M1 1');
});

test('B15.7 handlers run untracked with no owner; a returned promise is awaited by settled()', async (t) => {
  let done = false;
  const view = mountTest(t, () => h.button({ onclick: async () => { await new Promise((r) => setTimeout(r, 5)); done = true; } }, 'Go'));
  view.root.querySelector('button')!.click();
  assert.equal(done, false);
  await settled();
  assert.equal(done, true);
});

// ---------------------------------------------------------------- show / match (B10)

test('B10 show rebuilds only when truthiness flips; value is a live Read; regions are invisible', (t) => {
  const user = signal<{ name: string } | null>(null);
  let builds = 0;
  const view = mountTest(t, () => h.div(null, show(user, (u) => { builds++; return h.b(null, () => u().name); }, () => 'nobody')));
  assert.equal(view.root.innerHTML, '<div>nobody</div>');
  user.set({ name: 'Ada' }); flush();
  user.set({ name: 'Alan' }); flush();
  assert.equal(view.root.innerHTML, '<div><b>Alan</b></div>');
  assert.equal(builds, 1);
});

test('B10 match rebuilds on key change and disposes the old branch (onMount cleanup runs)', (t) => {
  const tab = signal('a');
  const log: string[] = [];
  const view = mountTest(t, () => h.div(null, match(tab, (k) => {
    onMount(() => { log.push(`mount ${k}`); return () => log.push(`cleanup ${k}`); });
    return h.span(null, k);
  })));
  tab.set('b'); flush();
  assert.equal(view.root.textContent, 'b');
  assert.deepEqual(log, ['mount a', 'cleanup a', 'mount b']);
});

// ---------------------------------------------------------------- each (B11)

test('B11 each keeps rows by key, moves them, updates items in place and disposes removed rows', (t) => {
  const list = signal([{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }]);
  const cleaned: number[] = [];
  const view = mountTest(t, () => h.ul(null, each(list, {
    key: (x) => x.id,
    render: (x, i, id) => { onMount(() => () => cleaned.push(id)); return h.li(null, () => `${i()}:${x().v}`); },
  })));
  const [li1, li2, li3] = view.root.querySelectorAll('li');
  list.set([{ id: 3, v: 'C' }, { id: 1, v: 'a' }, { id: 4, v: 'd' }]);
  flush();
  const now = view.root.querySelectorAll('li');
  assert.deepEqual(texts(view.root), ['0:C', '1:a', '2:d']);
  assert.equal(now[0], li3);
  assert.equal(now[1], li1);
  assert.equal(li2!.isConnected, false);
  assert.deepEqual(cleaned, [2]);
});

test('B11.4 a moved row that holds focus keeps it (insertBefore fallback refocuses)', (t) => {
  const list = signal([1, 2, 3]);
  const view = mountTest(t, () => h.div(null, each(list, { key: (x) => x, render: (x) => h.button(null, () => String(x())) })));
  const b3 = view.root.querySelectorAll('button')[2]!;
  b3.focus();
  list.set([3, 1, 2]); flush();
  assert.equal(document.activeElement, b3);
});

// ---------------------------------------------------------------- catchError (B8.5)

test('B8.5 catchError renders the fallback for a later error; reset() re-runs tryFn in the next flush', (t) => {
  const fail = signal(false);
  let tries = 0;
  const view = mountTest(t, () => h.div(null, catchError(() => {
    tries++;
    return h.p(null, () => { if (fail()) throw new Error('broken'); return 'fine'; });
  }, (err, reset) => h.button({ onclick: () => { fail.set(false); reset(); } }, `Retry (${(err as Error).message})`))));
  assert.equal(view.root.textContent, 'fine');
  fail.set(true); flush();
  assert.equal(view.root.textContent, 'Retry (broken)');
  view.root.querySelector('button')!.click();
  flush();
  assert.equal(view.root.textContent, 'fine');
  assert.equal(tries, 2);
});

test('B8.2 a synchronous setup error is caught by the catchError on the stack', (t) => {
  const Broken = component(function Broken(): Node { throw new Error('setup'); });
  const view = mountTest(t, () => h.div(null, catchError(() => Broken(), (e) => `caught ${(e as Error).message}`)));
  assert.equal(view.root.textContent, 'caught setup');
});

// ---------------------------------------------------------------- context, components, mount

test('B13 context: provide/useContext, default, NO_PROVIDER, structural lookup from later branches', (t) => {
  const Theme = createContext<string>('Theme');
  const Size = createContext<number>('Size', 3);
  const on = signal(false);
  const Leaf = component(function Leaf(): Node { return h.span(null, `${useContext(Theme)}/${useContext(Size)}`); });
  const view = mountTest(t, () => provide(Theme, 'dark', () => h.div(null, show(on, () => Leaf()))));
  on.set(true); flush();
  assert.equal(view.root.textContent, 'dark/3');
  assert.throws(() => mount(() => Leaf(), document.createElement('div')), (e) => codeOf(e) === 'NO_PROVIDER');
  assert.throws(() => useContext(Theme), (e) => codeOf(e) === 'CONTEXT_OUTSIDE_OWNER');
});

test('B16 mount: null target throws MOUNT_TARGET_MISSING; a throwing view keeps the target; unmount is idempotent', () => {
  assert.throws(() => mount(() => h.p(null), null), (e) => codeOf(e) === 'MOUNT_TARGET_MISSING');
  const target = document.createElement('div');
  target.append('old');
  assert.throws(() => mount(() => { throw new Error('view'); }, target), /view/);
  assert.equal(target.textContent, 'old');
  const unmount = mount(() => h.p(null, 'new'), target);
  assert.equal(target.textContent, 'new');
  unmount(); unmount();
  assert.equal(target.textContent, '');
});

// ---------------------------------------------------------------- dev diagnostics

test('STRICT_READ_UNTRACKED: a signal read directly in setup is reported with region and node', () => {
  const cap = capture();
  const count = signal(1, { debugName: 'count' });
  const Counter = component(function Counter(): Node { return h.p(null, `n=${count()}`); });
  const unmount = mount(() => Counter(), document.createElement('div'));
  cap.stop();
  unmount();
  assert.deepEqual(cap.codes(), ['STRICT_READ_UNTRACKED']);
  assert.match(cap.diags[0]!.message, /Signal "count" was read directly in <Counter>/);
  assert.match(cap.diags[0]!.loc ?? '', /test\/dom\.test\.ts:\d+:\d+/);
});

test('mountTest fails a test on warnings and reports leaked owners (EFFECT_LEAKED)', () => {
  const s = signal(0, { debugName: 's' });
  const view = mountTest({ after() {} }, () => h.p(null, `x${s()}`));
  assert.throws(() => view.dispose(), (e) => codeOf(e) === 'STRICT_READ_UNTRACKED' || /STRICT_READ_UNTRACKED/.test(String(e)));
  let stop = () => {};
  const leaky = mountTest({ after() {} }, () => h.button({ onclick: () => { stop = effect(() => { s(); }); } }, 'Leak'));
  leaky.root.querySelector('button')!.click();
  flush();
  assert.throws(() => leaky.dispose(), /EFFECT_LEAKED|NO_OWNER/);
  stop();
});

test('DUPLICATE_KEY and UNSTABLE_KEY are reported by each()', () => {
  const cap = capture();
  const unmount = mount(() => h.ul(null,
    each(() => [1, 1], { key: (x) => x, render: (x) => h.li(null, () => String(x())) }),
    each(() => [{}], { key: () => Math.random(), render: () => h.li(null, 'r') })), document.createElement('div'));
  cap.stop();
  unmount();
  assert.deepEqual(cap.codes().sort(), ['DUPLICATE_KEY', 'UNSTABLE_KEY']);
});

test('INTERACTIVE_NO_NAME and FOCUS_LOST after a flush', async (t) => {
  const cap = capture();
  const open = signal(true);
  const target = document.createElement('div');
  document.body.append(target);
  const unmount = mount(() => h.div(null, h.button(null), show(open, () => h.button({ 'aria-label': 'Close' }, 'x'))), target);
  flush();
  (target.querySelectorAll('button')[1] as HTMLButtonElement).focus();
  open.set(false);
  flush();
  await Promise.resolve();
  cap.stop();
  unmount();
  target.remove();
  assert.deepEqual(cap.codes(), ['INTERACTIVE_NO_NAME', 'FOCUS_LOST']);
  void t;
});

test('NODE_IN_TEXT_BINDING and COMPONENT_RETURN_NOT_NODE throw in dev', () => {
  assert.throws(() => h.p(null, () => h.b(null) as unknown as string), (e) => codeOf(e) === 'NODE_IN_TEXT_BINDING');
  const Bad = component(function Bad(): Node { return 'text' as unknown as Node; });
  const cap = capture();
  assert.throws(() => mount(() => Bad(), document.createElement('div')), (e) => codeOf(e) === 'COMPONENT_RETURN_NOT_NODE');
  cap.stop();
});
