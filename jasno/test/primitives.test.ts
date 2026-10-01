// Phase-1 exit criterion 2: mounting every built-in primitive in its minimal correct form gives 0 diagnostics.
// mountTest fails a test on any unexpected warning; the explicit diagnostics check makes the criterion visible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catchError, component, computed, createContext, createRoot, css, each, effect, flush, h, linkedSignal, match, mount,
  onMount, provide, resource, selector, show, signal, svg, untracked, useContext, type Read,
} from '@jasno/core';
import { createRouter, route, type ViewProps } from '@jasno/core/router';
import { mountTest, settled } from '@jasno/core/testing';
import { TAG_PROPS } from '../src/props.ts';

type Ctx = Parameters<typeof mountTest>[0];

async function clean(t: Ctx, view: () => Node): Promise<ReturnType<typeof mountTest>> {
  const v = mountTest(t, view);
  await settled();
  assert.deepEqual(v.diagnostics.map((d) => d.code), []);
  return v;
}

test(`every h tag (${Object.keys(TAG_PROPS).length}) mounts with 0 diagnostics`, async (t) => {
  const tags = Object.keys(TAG_PROPS) as (keyof typeof h)[];
  assert.equal(tags.length, 98);
  // Controls need an accessible name (INTERACTIVE_NO_NAME); every other tag mounts bare.
  const named = new Set(['button', 'a', 'input', 'select', 'textarea', 'dialog', 'meter', 'progress']);
  const v = await clean(t, () => h.div(null, ...tags.map((tag) =>
    (h[tag] as (p: object | null) => Node)(named.has(tag) ? { 'aria-label': tag } : null))));
  assert.equal(v.root.firstElementChild!.childElementCount, 98);
});

test('svg mounts with 0 diagnostics', async (t) => {
  await clean(t, () => svg('svg', { viewBox: '0 0 10 10', role: 'img', 'aria-label': 'Dot' }, svg('circle', { cx: 5, cy: 5, r: () => 4 })));
});

test('signal, computed, linkedSignal, untracked, flush: live text and props', async (t) => {
  const count = signal(1);
  const v = await clean(t, () => {
    const double = computed(() => count() * 2);
    const draft = linkedSignal({ source: count, computation: () => '' });
    const initial = untracked(count);
    return h.p({ title: () => `double ${double()}` }, count, ' ', double, ' ', draft, ' ', String(initial));
  });
  count.set(2);
  flush();
  assert.equal(v.root.textContent, '2 4  1');
});

test('selector, each, show, match', async (t) => {
  const items = signal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
  const selected = signal(1);
  const v = await clean(t, () => {
    const isSelected = selector(selected);
    return h.div(null,
      h.ul(null, each(items, { key: (x) => x.id, render: (x) => h.li({ class: { on: () => isSelected(x().id) } }, () => x().name) })),
      show(() => items().length > 1, () => h.p(null, 'many'), () => h.p(null, 'few')),
      match(() => (selected() === 1 ? 'one' : 'other'), (k) => h.span(null, k)),
    );
  });
  selected.set(2);
  flush();
  assert.equal(v.root.querySelector('.on')!.textContent, 'b');
});

test('component, effect, onMount, css', async (t) => {
  css`.primitives-card { padding: 1px; }`;
  const log: string[] = [];
  const Card = component(function Card(p: { title: Read<string> }): Node {
    effect(() => { log.push(`effect ${p.title()}`); });
    onMount(() => { log.push('mount'); });
    return h.section({ class: 'primitives-card' }, h.h2(null, p.title));
  });
  const title = signal('x');
  await clean(t, () => Card({ title }));
  assert.deepEqual(log.sort(), ['effect x', 'mount']);
});

test('resource loads and renders', async (t) => {
  const v = await clean(t, () => {
    const r = resource({ params: () => 7, loader: async ({ params }) => `item ${params}` });
    return show(() => r.hasValue() && r.value(), (value) => h.p(null, value), () => h.p({ role: 'status' }, 'Loading'));
  });
  assert.equal(v.root.textContent, 'item 7');
});

test('catchError: a failing subtree renders the fallback, with 0 diagnostics', async (t) => {
  const v = await clean(t, () => catchError(() => {
    throw new Error('broken');
  }, (err) => h.p({ role: 'alert' }, err instanceof Error ? err.message : 'error')));
  assert.equal(v.root.textContent, 'broken');
});

test('createContext, provide, useContext', async (t) => {
  const Theme = createContext<string>('Theme');
  const Child = component(function Child(): Node {
    const theme = useContext(Theme);
    return h.p(null, theme);
  });
  const v = await clean(t, () => provide(Theme, 'dark', () => Child()));
  assert.equal(v.root.textContent, 'dark');
});

test('createRoot and mount', async (t) => {
  const n = signal(0);
  const doubled = createRoot((dispose) => { t.after(dispose); return computed(() => n() * 2); });
  const host = document.createElement('div');
  document.body.append(host);
  const unmount = mount(() => h.p(null, doubled), host);
  n.set(3);
  flush();
  assert.equal(host.textContent, '6');
  unmount();
  host.remove();
  await clean(t, () => h.p(null, 'mount checked'));
});

test('router: createRouter, route, outlet', async (t) => {
  const View = component(function View(p: ViewProps<'/items/:id'>): Node { return h.h1(null, () => `Item ${p.params().id}`); });
  const router = createRouter([
    route('/items/:id', { view: async () => ({ default: View }), title: 'Item' }),
  ], { error: () => h.p(null, 'error'), notFound: () => h.h1(null, 'Not found') });
  history.replaceState(null, '', '/items/3');
  const v = await clean(t, () => h.main(null, router.outlet()));
  assert.equal(v.root.querySelector('h1')!.textContent, 'Item 3');
});
