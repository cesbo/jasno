// Spec conformance: router UI behaviour (design.md B17.3, B17.4, B17.8, B17.9, B17.11, B17.15, B17.18; ADR-21, ADR-33)
// and the RECIPES router patterns (Detail over a list, Redirect, Tabs, Per-param lifecycle, Route tests), History adapter
// (happy-dom has no Navigation API).
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { component, computed, h, match, mount, onMount, show, signal, type Read } from 'jasno';
import { createRouter, route } from 'jasno/router';
import { mountTest, settled } from 'jasno/testing';
import { capture, codeOf, deferred } from '../helpers.ts';

type Ctx = TestContext;
type Expect = NonNullable<NonNullable<Parameters<typeof mountTest>[2]>['expect']>;
type Routes = Parameters<typeof createRouter>[0];
type Router = ReturnType<typeof createRouter>;
type ViewModule = { default: (p: any) => Node }; // eslint-disable-line @typescript-eslint/no-explicit-any -- one module shape for every pattern
type P = { params: Read<any>; data: Read<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A lazy view module (section > h1 + extra) counting imports and builds. */
function page(name: string, extra: (p: P) => Node | string = () => '') {
  const s = { imports: 0, builds: 0 };
  const View = component(function Page(p: P): Node { s.builds++; return h.section(null, h.h1(null, name), extra(p)); });
  return { s, view: async (): Promise<ViewModule> => { s.imports++; return { default: View as ViewModule['default'] }; } };
}
/** A view module without an h1. */
const bare = (body: () => Node) => async (): Promise<ViewModule> =>
  ({ default: component(function Bare(): Node { return h.section(null, body()); }) as ViewModule['default'] });

const errorView = (e: unknown, retry: () => void) =>
  h.section({ role: 'alert' }, h.h1(null, 'Error'), h.p(null, String((e as Error)?.message ?? e)), h.button({ onclick: retry }, 'Retry'));
const notFound = () => h.section(null, h.h1(null, 'Not found'));
const opts = { error: errorView, notFound };

function setup(t: Ctx, routes: Routes, start = '/', o: { expect?: Expect; shell?: (outlet: Node) => Node } = {}) {
  history.replaceState(null, '', start);
  const router = createRouter(routes, opts);
  const view = mountTest(t, () => (o.shell ?? ((x) => h.main(null, x)))(router.outlet()), { expect: o.expect });
  const $ = <E extends Element = HTMLElement>(sel: string) => view.root.querySelector<E>(sel);
  return { router, view, $ };
}

const liveRegions = () => [...document.querySelectorAll<HTMLElement>('body > [aria-live]')];

/** Records whether the router took a link click; stops happy-dom from following links the router left alone. */
function clicker(t: Ctx) {
  let prevented = false;
  const stop = (e: Event) => {
    prevented = e.defaultPrevented;
    if ((e.target as Element).closest('a')) e.preventDefault(); // buttons keep their default (dialog forms)
  };
  window.addEventListener('click', stop);
  t.after(() => window.removeEventListener('click', stop));
  return (el: Element | null, init: MouseEventInit = {}): boolean => {
    prevented = false;
    assert.ok(el, 'element to click');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    return prevented;
  };
}

/** Counts popstate events (history traversals). */
function traversals(t: Ctx) {
  const c = { n: 0 };
  const on = () => { c.n++; };
  window.addEventListener('popstate', on);
  t.after(() => window.removeEventListener('popstate', on));
  return c;
}

/** Records window.scrollTo calls with the h1 rendered at that moment, and still scrolls. */
function scrolls(t: Ctx) {
  const real = window.scrollTo.bind(window);
  real(0, 0);
  const calls: { to: number[]; h1: string | null | undefined }[] = [];
  t.mock.method(window, 'scrollTo', (...a: number[]) => {
    calls.push({ to: a, h1: document.querySelector('main h1')?.textContent });
    real(a[0]!, a[1]!);
  });
  t.after(() => real(0, 0));
  return { calls, real };
}

// ================================================================ B17.3 outlet lifecycle

test('B17.3 outlet() needs an owner: called outside any owner it is refused or reported (NO_OWNER)', (t) => {
  history.replaceState(null, '', '/');
  const router = createRouter([route('/', { view: page('home').view })], opts);
  const cap = capture();
  // The ownerless outlet can never be disposed: keep its listeners from being added so it cannot touch later tests.
  t.mock.method(document, 'addEventListener', () => {});
  t.mock.method(window, 'addEventListener', () => {});
  let threw: unknown;
  try { router.outlet(); } catch (e) { threw = e; }
  t.mock.restoreAll();
  cap.stop();
  assert.ok(threw !== undefined || cap.codes().includes('NO_OWNER'), `codes: ${cap.codes().join(', ')}`);
});

test('B17.3 OUTLET_ALREADY_ACTIVE: a second outlet throws the catalogue message naming the live one; after disposal it starts again', async (t) => {
  history.replaceState(null, '', '/');
  const router = createRouter([route('/', { view: page('home').view })], opts);
  const Shell = component(function Shell(): Node { return h.main(null, router.outlet()); });
  const first = mountTest(t, () => Shell());
  await settled();
  const target = document.createElement('div');
  let err: unknown;
  try { mount(() => h.div(null, router.outlet()), target); } catch (e) { err = e; }
  assert.equal(codeOf(err), 'OUTLET_ALREADY_ACTIVE');
  assert.match((err as Error).message, /router\.outlet\(\) is already rendered in <Shell>\./);
  assert.equal(first.root.querySelector('h1')?.textContent, 'home', 'the live outlet is untouched');
  first.dispose();
  const second = mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  assert.equal(second.root.querySelector('h1')?.textContent, 'home');
});

test('B17.3 disposing the outlet stops link interception, popstate handling and intent preload, and removes the live region', async (t) => {
  const b = page('b');
  const { router, view } = setup(t, [route('/', { view: page('home').view }), route('/b', { view: b.view }), route('/c', { view: page('c').view })]);
  await settled();
  await router.navigate('/c');
  const live = liveRegions();
  assert.equal(live.length, 1, 'announced');
  view.dispose();
  assert.equal(live[0]!.isConnected, false, 'live region removed');
  const click = clicker(t);
  const a = document.body.appendChild(Object.assign(document.createElement('a'), { href: '/b', textContent: 'B' }));
  t.after(() => a.remove());
  a.dispatchEvent(new PointerEvent('pointerenter'));
  a.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  assert.equal(click(a), false, 'click not intercepted');
  history.pushState(null, '', '/b');
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  await settled();
  assert.deepEqual(b.s, { imports: 0, builds: 0 }, 'no preload, no popstate navigation');
  assert.equal(liveRegions().length, 0);
  history.replaceState(null, '', '/');
});

// ================================================================ B17.4 interception (History adapter)

test('B17.4 only primary-button unmodified clicks are intercepted', async (t) => {
  const next = page('next');
  const { router, $ } = setup(t, [route('/', { view: page('home', () => h.a({ href: '/next', id: 'l' }, 'Next')).view }), route('/next', { view: next.view })]);
  await settled();
  const click = clicker(t);
  for (const init of [{ button: 1 }, { button: 2 }, { shiftKey: true }, { altKey: true }, { metaKey: true }, { ctrlKey: true }] as MouseEventInit[]) {
    assert.equal(click($('#l'), init), false, JSON.stringify(init));
  }
  await settled();
  assert.equal(router.url().pathname, '/');
  assert.equal(next.s.builds, 0);
  assert.equal(click($('#l')), true);
  await settled();
  assert.equal($('h1')?.textContent, 'next');
});

test('B17.4 a click on an element inside a matching link is intercepted; relative hrefs resolve against the current URL', async (t) => {
  const { router, $ } = setup(t, [
    route('/docs/a', { view: page('a', () => h.a({ href: 'b' }, h.span({ id: 'inner' }, 'to b'))).view }),
    route('/docs/b', { view: page('b', () => h.a({ href: '?q=1', id: 'q' }, 'search')).view }),
  ], '/docs/a');
  await settled();
  const click = clicker(t);
  assert.equal(click($('#inner')), true);
  await settled();
  assert.equal(router.url().pathname, '/docs/b');
  assert.equal($('h1')?.textContent, 'b');
  assert.equal(click($('#q')), true);
  assert.equal(router.url().href, 'http://localhost/docs/b?q=1');
});

test('B17.4 cross-origin, unmatched, target (even _self) and app-prevented links are left to the browser', async (t) => {
  const b = page('b');
  const { router, $ } = setup(t, [route('/', { view: page('home', () => h.nav(null,
    h.a({ href: 'http://localhost:8080/b', id: 'port' }, 'port'),
    h.a({ href: 'https://localhost/b', id: 'scheme' }, 'scheme'),
    h.a({ href: '/b/deeper', id: 'unmatched' }, 'unmatched'),
    h.a({ href: '/b', target: '_self', id: 'self' }, 'self'),
    h.a({ href: '/b', id: 'app', onclick: (e) => e.preventDefault() }, 'app'))).view }), route('/b', { view: b.view })]);
  await settled();
  const click = clicker(t);
  for (const id of ['port', 'scheme', 'unmatched', 'self']) assert.equal(click($(`#${id}`)), false, id);
  click($('#app'));
  await settled();
  assert.equal(router.url().pathname, '/');
  assert.equal(b.s.builds, 0);
});

test('B17.4 the History adapter does not intercept form submissions (GET or POST)', async (t) => {
  const b = page('b');
  const { router, $ } = setup(t, [route('/', { view: page('home', () => h.div(null,
    h.form({ method: 'get', action: '/b', id: 'get' }, h.button(null, 'Go')),
    h.form({ method: 'post', action: '/b', id: 'post' }, h.button(null, 'Post')))).view }), route('/b', { view: b.view })]);
  await settled();
  let prevented: boolean[] = [];
  const stop = (e: Event) => { prevented.push(e.defaultPrevented); e.preventDefault(); };
  window.addEventListener('submit', stop);
  t.after(() => window.removeEventListener('submit', stop));
  $<HTMLFormElement>('#get')!.requestSubmit();
  $<HTMLFormElement>('#post')!.requestSubmit();
  await settled();
  assert.deepEqual(prevented, [false, false]);
  assert.equal(router.url().pathname, '/');
  assert.equal(b.s.builds, 0);
  prevented = [];
});

test('B17.4 popstate: browser Back and Forward between routes render them', async (t) => {
  const { router, $ } = setup(t, [route('/', { view: page('home').view }), route('/b', { view: page('b').view })]);
  await settled();
  await router.navigate('/b');
  history.back();
  await settled();
  assert.equal($('h1')?.textContent, 'home');
  assert.equal(router.url().pathname, '/');
  history.forward();
  await settled();
  assert.equal($('h1')?.textContent, 'b');
  assert.equal(document.activeElement, $('h1'), 'focus moves after a traversal too');
});

// ================================================================ B17.8 focus

test('B17.8 [autofocus] candidates skip hidden elements, closed dialogs and hidden popovers; the first passing one wins', async (t) => {
  const { router, $ } = setup(t, [
    route('/', { view: page('home').view }),
    route('/form', { view: page('form', () => h.div(null,
      h.div({ style: { display: 'none' } }, h.input({ autofocus: true, id: 'hidden', 'aria-label': 'hidden' })),
      h.dialog(null, h.input({ autofocus: true, id: 'dialog', 'aria-label': 'dialog' })),
      h.div({ popover: 'auto' }, h.input({ autofocus: true, id: 'popover', 'aria-label': 'popover' })),
      h.input({ autofocus: true, id: 'second', 'aria-label': 'second' }),
      h.input({ autofocus: true, id: 'third', 'aria-label': 'third' }))).view }),
    route('/only-hidden', { view: page('only hidden', () => h.dialog(null, h.input({ autofocus: true, 'aria-label': 'x' }))).view }),
  ]);
  await settled();
  await router.navigate('/form');
  assert.equal(document.activeElement?.id, 'second');
  await router.navigate('/only-hidden');
  assert.equal(document.activeElement, $('h1'), 'no visible [autofocus]: the h1');
});

test('B17.8 a candidate that does not take focus is skipped: a disabled [autofocus] falls to the h1, an h1 that refuses focus to main', async (t) => {
  const { router, $ } = setup(t, [
    route('/', { view: page('home').view }),
    route('/disabled', { view: page('disabled', () => h.input({ autofocus: true, disabled: true, 'aria-label': 'x' })).view }),
    route('/refuse', { view: bare(() => { const title = h.h1(null, 'Refuses'); title.focus = () => {}; return title; }) }),
    route('/disabled-only', { view: bare(() => h.input({ autofocus: true, disabled: true, 'aria-label': 'x' })) }),
  ]);
  await settled();
  await router.navigate('/disabled');
  assert.equal(document.activeElement, $('h1'));
  assert.equal($('h1')!.getAttribute('tabindex'), '-1');
  await router.navigate('/refuse');
  assert.equal(document.activeElement, $('main'));
  assert.equal($('main')!.getAttribute('tabindex'), '-1');
  (document.activeElement as HTMLElement).blur();
  await router.navigate('/disabled-only'); // it has an [autofocus] candidate, so no VIEW_NO_HEADING
  assert.equal(document.activeElement, $('main'));
});

test('B17.8 the first h1 anywhere in the view is focused: inside a child component, a show() branch, after other content', async (t) => {
  const Header = component(function Header(): Node { return h.header(null, h.div(null, h.h1({ id: 'deep' }, 'Deep'))); });
  const { router } = setup(t, [
    route('/', { view: page('home').view }),
    route('/deep', { view: bare(() => h.div(null, h.p(null, 'intro'), Header(), h.h1({ id: 'later' }, 'Later'))) }),
  ], '/', { shell: (o) => h.div(null, h.header(null, h.h1({ id: 'shell' }, 'Shell')), h.main(null, o)) });
  await settled();
  await router.navigate('/deep');
  assert.equal(document.activeElement?.id, 'deep');
  assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
});

test('B17.8 main is the outlet\'s closest main (outlet nested in it); VIEW_NO_HEADING uses the catalogue message with the route', async (t) => {
  const { router, view } = setup(t, [
    route('/', { view: page('home').view }),
    route('/users/:id', { view: bare(() => h.p(null, 'no heading')) }),
    route('/hidden', { view: bare(() => h.div({ style: { display: 'none' } }, h.input({ autofocus: true, 'aria-label': 'x' }))) }),
  ], '/', { expect: ['VIEW_NO_HEADING'], shell: (o) => h.div(null, h.header(null, h.h1(null, 'Shell')), h.main({ id: 'm' }, h.div(null, h.div(null, o)))) });
  await settled();
  await router.navigate('/users/1');
  assert.equal(document.activeElement?.id, 'm');
  assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
  await router.navigate('/');
  await router.navigate('/hidden');
  assert.equal(document.activeElement?.id, 'm', 'a hidden [autofocus] is no candidate');
  const warns = view.diagnostics.filter((d) => d.code === 'VIEW_NO_HEADING').map((d) => d.message);
  assert.equal(warns.length, 2);
  assert.ok(warns[0]!.includes('The view for "/users/:id" has no h1 or visible [autofocus]; the router focused <main>.'), warns[0]);
  assert.ok(warns[1]!.includes('The view for "/hidden" has no h1 or visible [autofocus]; the router focused <main>.'), warns[1]);
});

test('B17.8 never on the first render: a start view with [autofocus] and an h1 leaves focus where it was', async (t) => {
  const outside = document.body.appendChild(document.createElement('button'));
  t.after(() => outside.remove());
  outside.focus();
  const { $ } = setup(t, [route('/f', { view: page('f', () => h.input({ autofocus: true, 'aria-label': 'x' })).view })], '/f');
  await settled();
  assert.equal(document.activeElement, outside);
  assert.equal($('h1')!.hasAttribute('tabindex'), false);
  outside.blur();
});

// ================================================================ B17.9 announcement

test('B17.9 the live region is appended to body at the first announcement: one, polite, visually hidden, reused', async (t) => {
  const before = liveRegions().length;
  const { router } = setup(t, [route('/', { view: page('home').view }), route('/a', { view: page('a').view, title: 'Alpha' })]);
  await settled();
  assert.equal(liveRegions().length, before, 'no announcement on the first render');
  await router.navigate('/a');
  const [live, ...rest] = liveRegions().slice(before);
  assert.ok(live);
  assert.equal(rest.length, 0);
  assert.equal(live.parentElement, document.body);
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(live.textContent, 'Alpha');
  const cs = getComputedStyle(live);
  assert.notEqual(cs.display, 'none');
  assert.notEqual(cs.visibility, 'hidden');
  assert.equal(live.style.position, 'absolute', 'taken out of the flow');
  assert.ok(live.style.width === '1px' || /inset|rect/.test(live.style.clipPath + live.style.clip), 'clipped to nothing');
  await router.navigate('/');
  assert.equal(liveRegions().length, before + 1, 'reused');
  assert.equal(live.textContent, 'home');
});

test('B17.9 announcement text: title string, title(data), else the first h1 text (live, in a child component, also when [autofocus] took focus)', async (t) => {
  const Heading = component(function Heading(p: { text: string }): Node { return h.div(null, h.h1(null, p.text)); });
  const { router } = setup(t, [
    route('/', { view: page('home').view }),
    route('/a', { view: page('a').view, title: 'Alpha' }),
    route('/u/:id', { view: page('u').view, loader: async ({ params }) => ({ name: `User ${params.id}` }), title: (d) => (d as unknown as { name: string }).name }),
    route('/form', { view: bare(() => h.div(null, h.input({ autofocus: true, 'aria-label': 'Name' }), h.h1(null, 'Edit form'))) }),
    route('/live', { view: async () => ({ default: component(function Live(p: P): Node { return h.h1(null, () => `Loaded ${p.data()}`); }) as ViewModule['default'] }), loader: async () => 42 }),
    route('/child', { view: bare(() => Heading({ text: 'From child' })) }),
  ]);
  await settled();
  const said = () => liveRegions().at(-1)?.textContent;
  await router.navigate('/a');
  assert.equal(said(), 'Alpha');
  await router.navigate('/u/3');
  assert.equal(said(), 'User 3');
  await router.navigate('/form');
  assert.equal(document.activeElement?.tagName, 'INPUT');
  assert.equal(said(), 'Edit form');
  await router.navigate('/live');
  assert.equal(said(), 'Loaded 42');
  await router.navigate('/child');
  assert.equal(said(), 'From child');
});

test('B17.9 no title and no h1: nothing is announced, so no live region is appended yet', async (t) => {
  const before = liveRegions().length;
  const { router } = setup(t, [
    route('/', { view: page('home').view }),
    route('/quiet', { view: bare(() => h.input({ autofocus: true, 'aria-label': 'Search' })) }),
  ]);
  await settled();
  await router.navigate('/quiet');
  assert.equal(document.activeElement?.tagName, 'INPUT');
  assert.equal(liveRegions().length, before);
});

test('B17.9 with document.body.ariaNotify the text goes there and no live region is created', async (t) => {
  const said: string[] = [];
  const body = document.body as HTMLElement & { ariaNotify?: (s: string) => void };
  body.ariaNotify = (s: string) => { said.push(s); };
  t.after(() => { delete body.ariaNotify; });
  const before = liveRegions().length;
  const { router } = setup(t, [route('/', { view: page('home').view }), route('/a', { view: page('a').view, title: 'Alpha' })]);
  await settled();
  await router.navigate('/a');
  await router.navigate('/');
  assert.deepEqual(said, ['Alpha', 'home']);
  assert.equal(liveRegions().length, before);
});

// ================================================================ B17.11 scroll (History adapter)

test('B17.11 a push (navigate or link click) scrolls to the top after the new view rendered', async (t) => {
  const s = scrolls(t);
  const { router, $ } = setup(t, [route('/', { view: page('home', () => h.a({ href: '/c', id: 'c' }, 'C')).view }), route('/b', { view: page('b').view }), route('/c', { view: page('c').view })]);
  await settled();
  s.real(0, 400);
  await router.navigate('/b');
  assert.deepEqual(s.calls.at(-1), { to: [0, 0], h1: 'b' });
  assert.equal(window.scrollY, 0);
  await router.navigate('/');
  s.real(0, 300);
  const click = clicker(t);
  click($('#c'));
  await settled();
  assert.deepEqual(s.calls.at(-1), { to: [0, 0], h1: 'c' });
  assert.equal(window.scrollY, 0);
});

test('B17.11 popstate restores the saved position: Back returns to where the page was scrolled, after render', async (t) => {
  const s = scrolls(t);
  const { router } = setup(t, [route('/', { view: page('home').view }), route('/b', { view: page('b').view })]);
  await settled();
  s.real(0, 500);
  await router.navigate('/b');
  assert.equal(window.scrollY, 0);
  history.back();
  await settled();
  assert.deepEqual(s.calls.at(-1), { to: [0, 500], h1: 'home' });
  assert.equal(window.scrollY, 500);
});

test('B17.11 popstate restores the saved position also on Forward (the position the entry had when the user left it)', async (t) => {
  const s = scrolls(t);
  const { router } = setup(t, [route('/', { view: page('home').view }), route('/b', { view: page('b').view })]);
  await settled();
  s.real(0, 500);
  await router.navigate('/b');
  s.real(0, 300);
  history.back();
  await settled();
  assert.equal(window.scrollY, 500);
  history.forward();
  await settled();
  assert.equal(router.url().pathname, '/b');
  assert.equal(window.scrollY, 300, 'Forward should restore /b\'s position; it stays at /\'s');
});

test('B17.11 search-only navigations keep the scroll position (link click, navigate push, Back and Forward)', async (t) => {
  const s = scrolls(t);
  const { router, $ } = setup(t, [route('/', { view: page('home', () => h.a({ href: '?q=1', id: 'q' }, 'q')).view })]);
  await settled();
  s.real(0, 250);
  const before = s.calls.length;
  const click = clicker(t);
  assert.equal(click($('#q')), true);
  await router.navigate('?q=2');
  history.back();
  await settled();
  history.forward();
  await settled();
  assert.equal(router.url().search, '?q=2');
  assert.equal(s.calls.length, before);
  assert.equal(window.scrollY, 250);
});

test('B17.11 a pushed link whose loader redirects with replace (RECIPES Redirect) still ends at the top of the page', async (t) => {
  const s = scrolls(t);
  let router!: Router;
  ({ router } = setup(t, [
    route('/', { view: page('home', () => h.a({ href: '/admin', id: 'admin' }, 'Admin')).view }),
    route('/admin', { view: page('admin').view, loader: async () => { void router.navigate('/login', { replace: true }); return null; } }),
    route('/login', { view: page('login').view }),
  ]));
  await settled();
  s.real(0, 400);
  const click = clicker(t);
  click(document.querySelector('#admin'));
  await settled();
  assert.equal(router.url().pathname, '/login');
  assert.equal(window.scrollY, 0, 'the user pushed a new page; it opens scrolled to the old page\'s offset');
});

// ================================================================ B17.15 intent preload

test('B17.15 pointerenter and focusin on a matching link start its view import (not its loader); the navigation reuses it', async (t) => {
  let loads = 0;
  const b = page('b');
  const c = page('c');
  const { router, $ } = setup(t, [
    route('/', { view: page('home', () => h.nav(null, h.a({ href: '/b', id: 'b' }, h.span({ id: 'bs' }, 'B')), h.a({ href: '/c', id: 'c' }, 'C'))).view }),
    route('/b', { view: b.view, loader: async () => { loads++; return 1; } }),
    route('/c', { view: c.view }),
  ]);
  await settled();
  $('#b')!.dispatchEvent(new PointerEvent('pointerenter'));
  $('#c')!.focus();
  await settled();
  assert.deepEqual([b.s.imports, c.s.imports, loads], [1, 1, 0]);
  await router.navigate('/b');
  assert.deepEqual([b.s.imports, b.s.builds, loads], [1, 1, 1]);
});

test('B17.15 unmatched and cross-origin links preload nothing; a failed preload is not cached', async (t) => {
  const b = page('b');
  let fail = true;
  const flaky = async (): Promise<ViewModule> => { if (fail) { fail = false; throw new Error('flaky'); } return b.view(); };
  const { router, $ } = setup(t, [
    route('/', { view: page('home', () => h.nav(null,
      h.a({ href: '/b/more', id: 'unmatched' }, 'U'), h.a({ href: 'http://other.test/b', id: 'external' }, 'E'), h.a({ href: '/b', id: 'b' }, 'B'))).view }),
    route('/b', { view: flaky }),
  ]);
  await settled();
  for (const id of ['unmatched', 'external']) $(`#${id}`)!.dispatchEvent(new PointerEvent('pointerenter'));
  await settled();
  assert.equal(fail, true, 'nothing imported');
  $('#b')!.dispatchEvent(new PointerEvent('pointerenter'));
  await settled();
  assert.equal(fail, false, 'preload ran and failed');
  assert.equal(await router.navigate('/b'), 'done');
  assert.equal(b.s.builds, 1);
});

// ================================================================ B17.18 back()

test('B17.18 back(): index 0 at the start entry, +1 per push, unchanged on replace; traverses only above 0, else replaces with the fallback', async (t) => {
  const pops = traversals(t);
  const { router, $ } = setup(t, [route('/home', { view: page('home').view }), route('/a', { view: page('a').view }), route('/b', { view: page('b').view }), route('/c', { view: page('c').view })], '/a');
  await settled();
  const len = history.length;
  assert.equal(await router.back('/home'), 'done', 'start entry: fallback');
  assert.deepEqual([location.pathname, history.length, pops.n], ['/home', len, 0]);
  assert.equal(await router.back('/a'), 'done', 'the replaced entry is still index 0');
  assert.deepEqual([location.pathname, history.length, pops.n], ['/a', len, 0]);
  await router.navigate('/b');                   // 1
  await router.navigate('/c');                   // 2
  await router.navigate('/home', { replace: true }); // still 2
  assert.equal(await router.back('/x'), 'done');
  assert.deepEqual([location.pathname, pops.n], ['/b', 1]);
  assert.equal(await router.back('/x'), 'done');
  assert.deepEqual([location.pathname, pops.n], ['/a', 2]);
  assert.equal($('h1')?.textContent, 'a');
  assert.equal(await router.back('/home'), 'done', 'back at the start entry: fallback again');
  assert.deepEqual([location.pathname, pops.n], ['/home', 2]);
});

test('B17.18 link clicks and search-only pushes count as pushes; browser Back and Forward keep the index in step', async (t) => {
  const pops = traversals(t);
  const { router, $ } = setup(t, [route('/', { view: page('home', () => h.a({ href: '/b', id: 'b' }, 'B')).view }), route('/b', { view: page('b').view })]);
  await settled();
  const click = clicker(t);
  click($('#b'));                     // 1
  await settled();
  await router.navigate('?q=1');      // 2
  history.back();                     // user Back: 1
  await settled();
  assert.equal(router.url().href, 'http://localhost/b');
  assert.equal(await router.back('/'), 'done');
  assert.equal(location.pathname, '/');
  history.forward();                  // user Forward: 1
  await settled();
  const n = pops.n;
  assert.equal(await router.back('/nowhere'), 'done');
  assert.deepEqual([location.pathname, pops.n], ['/', n + 1], 'traversed, not the fallback');
});

test('B17.18 the index lives in history.state: a router started on an entry above 0 (a reload) traverses back', async (t) => {
  const pops = traversals(t);
  const routes = [route('/', { view: page('home').view }), route('/b', { view: page('b').view })];
  const first = setup(t, routes);
  await settled();
  await first.router.navigate('/b');
  first.view.dispose();
  const router = createRouter(routes, opts);    // same entry, as after a reload
  const view = mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  const len = history.length;
  const n = pops.n;
  assert.equal(await router.back('/nowhere'), 'done');
  assert.deepEqual([location.pathname, history.length, pops.n], ['/', len, n + 1]);
  assert.equal(view.root.querySelector('h1')?.textContent, 'home');
});

test('B17.18 back() resolves with the traversal\'s result, after the previous route\'s loader', async (t) => {
  const gate = deferred<string>();
  let calls = 0;
  const { router, $ } = setup(t, [route('/', { view: page('home').view, loader: () => (++calls === 1 ? Promise.resolve('first') : gate.promise) }), route('/b', { view: page('b').view })]);
  await settled();
  await router.navigate('/b');
  let result: unknown = 'pending';
  const p = router.back('/').then((r) => { result = r; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(result, 'pending');
  gate.resolve('again');
  await p;
  assert.equal(result, 'done');
  assert.equal($('h1')?.textContent, 'home');
});

/**
 * Runs an ES module snippet in a child process with happy-dom and without jasno/testing: a promise that never settles
 * there cannot hang settled() in this process. Returns the last line printed.
 */
function isolated(code: string): string {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const r = spawnSync(process.execPath, ['--conditions=development', '--import', './src/happy-dom.ts', '--input-type=module', '-e', code],
    { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split('\n').at(-1)!;
}

test('B17.18 two back() calls before the first traversal arrives both settle (the first is not lost)', () => {
  const out = isolated(`
    import { component, h, mount } from 'jasno';
    import { createRouter, route } from 'jasno/router';
    const view = (name) => async () => ({ default: component(function V() { return h.h1(null, name); }) });
    const router = createRouter([route('/', { view: view('home') }), route('/b', { view: view('b') }), route('/c', { view: view('c') })],
      { error: () => h.p(null, 'error'), notFound: () => h.p(null, 'not found') });
    history.replaceState(null, '', '/');
    const target = document.body.appendChild(document.createElement('div'));
    mount(() => h.main(null, router.outlet()), target);
    await new Promise((r) => setTimeout(r, 5));
    await router.navigate('/b');
    await router.navigate('/c');
    // Browsers fire popstate asynchronously after history.back(); happy-dom fires it synchronously.
    const realBack = History.prototype.back;
    history.back = function () { setTimeout(() => realBack.call(history), 0); };
    const results = ['pending', 'pending'];
    void router.back('/').then((r) => { results[0] = r; }); // a double click on a Back button
    void router.back('/').then((r) => { results[1] = r; });
    await new Promise((r) => setTimeout(r, 50));
    console.log(JSON.stringify(results));
    process.exit(0);
  `);
  const [first, second] = JSON.parse(out) as string[];
  assert.notEqual(second, 'pending', 'second back() settles');
  assert.notEqual(first, 'pending', 'first back() never settles: its resolver in pendingBack was overwritten');
});

test('RR-10: two back() calls before the traversal arrives take one step, not two', () => {
  const out = isolated(`
    import { component, h, mount } from 'jasno';
    import { createRouter, route } from 'jasno/router';
    const view = (name) => async () => ({ default: component(function V() { return h.h1(null, name); }) });
    const router = createRouter([route('/', { view: view('home') }), route('/b', { view: view('b') }), route('/c', { view: view('c') })],
      { error: () => h.p(null, 'error'), notFound: () => h.p(null, 'not found') });
    history.replaceState(null, '', '/');
    const target = document.body.appendChild(document.createElement('div'));
    mount(() => h.main(null, router.outlet()), target);
    await new Promise((r) => setTimeout(r, 5));
    await router.navigate('/b');
    await router.navigate('/c');
    const realBack = History.prototype.back;
    history.back = function () { setTimeout(() => realBack.call(history), 0); };
    await Promise.all([router.back('/'), router.back('/')]);
    await new Promise((r) => setTimeout(r, 20));
    console.log(location.pathname);
    process.exit(0);
  `);
  assert.equal(out, '/b');
});

test('B17.18 back() with a cross-origin fallback behaves as navigate(fallback, { replace: true }) (a full navigation)', async (t) => {
  const assigned: string[] = [];
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  const { router } = setup(t, [route('/', { view: page('home').view })]);
  await settled();
  const viaNavigate = await router.navigate('https://example.com/x', { replace: true });
  assert.deepEqual([viaNavigate, assigned], ['done', ['https://example.com/x']]);
  let viaBack: unknown;
  try { viaBack = await router.back('https://example.com/x'); } catch (e) { viaBack = e; }
  assert.equal(location.origin, 'http://localhost');
  assert.deepEqual([viaBack, assigned], ['done', ['https://example.com/x', 'https://example.com/x']]);
});

// ================================================================ Navigation API adapter (a same-document fake)

/**
 * A minimal Navigation API for the router's NavigationAdapter: navigate events with intercept(), entries, canGoBack,
 * back(); an intercepted navigation commits (location follows) after dispatch, like 'commit: immediate'. A navigation
 * nobody intercepts is recorded as a full document load. location.assign() fires navigate as in browsers.
 */
function fakeNavigation(t: Ctx, earlierLoads: readonly string[] = []) {
  const listeners = new Set<(e: Event) => void>();
  // earlierLoads: entries of earlier document loads in this tab (same origin, sameDocument false)
  const entries = [...earlierLoads.map((u, index) => ({ url: new URL(u, location.href).href, index, sameDocument: false })),
    { url: location.href, index: earlierLoads.length, sameDocument: true }];
  let cur = earlierLoads.length;
  const events: { type: string; url: string; intercepted?: { focusReset?: string | undefined; scroll?: string | undefined } | undefined }[] = [];
  const fullLoads: string[] = [];
  const fire = (to: string, navigationType: string, init: { formData?: FormData; downloadRequest?: string; index?: number } = {}) => {
    const dest = new URL(to, location.href);
    const here = new URL(location.href);
    const rec: (typeof events)[number] = { type: navigationType, url: dest.href };
    let handler: (() => Promise<void>) | undefined;
    const e = Object.assign(new Event('navigate', { cancelable: true }), {
      canIntercept: dest.origin === here.origin, downloadRequest: init.downloadRequest ?? null, formData: init.formData ?? null,
      hashChange: navigationType !== 'traverse' && dest.hash !== here.hash && dest.pathname + dest.search === here.pathname + here.search,
      navigationType, destination: { url: dest.href },
      intercept(o: { handler: () => Promise<void>; focusReset?: string; scroll?: string }) { rec.intercepted = { focusReset: o.focusReset, scroll: o.scroll }; handler = o.handler; },
    });
    events.push(rec);
    for (const l of [...listeners]) l(e);
    if (!handler) { fullLoads.push(dest.href); return { committed: Promise.resolve(), finished: Promise.resolve() }; }
    if (navigationType === 'traverse') cur = init.index!;
    else if (navigationType === 'replace') entries[cur] = { url: dest.href, index: cur, sameDocument: true };
    else { entries.splice(cur + 1); entries.push({ url: dest.href, index: cur + 1, sameDocument: true }); cur++; }
    history.replaceState(null, '', dest.href);
    return { committed: Promise.resolve(), finished: handler() };
  };
  const nav = {
    addEventListener(_type: string, fn: (e: Event) => void, o?: AddEventListenerOptions) {
      listeners.add(fn);
      o?.signal?.addEventListener('abort', () => listeners.delete(fn));
    },
    navigate: (to: string, o: { history?: string } = {}) => fire(to, o.history === 'replace' ? 'replace' : 'push'),
    back: () => fire(entries[cur - 1]!.url, 'traverse', { index: cur - 1 }),
    entries: () => entries.slice(),
    get currentEntry() { return entries[cur]!; },
    get canGoBack() { return cur > 0; },
  };
  (globalThis as Record<string, unknown>).navigation = nav;
  t.after(() => { delete (globalThis as Record<string, unknown>).navigation; history.replaceState(null, '', '/'); });
  t.mock.method(location, 'assign', (u: string) => { const url = new URL(u, location.href).href; fire(url, url === location.href ? 'replace' : 'push'); });
  return { fire, events, fullLoads, listeners };
}

test('B17.4/B17.11 Navigation API: matching same-origin navigations are intercepted (focusReset manual, scroll after-transition; search-only scroll manual)', async (t) => {
  const fake = fakeNavigation(t);
  const { router, view, $ } = setup(t, [route('/', { view: page('home').view }), route('/b', { view: page('b').view }), route('/c', { view: page('c').view })]);
  await settled();
  assert.equal(await router.navigate('/b'), 'done');
  assert.deepEqual(fake.events.at(-1), { type: 'push', url: 'http://localhost/b', intercepted: { focusReset: 'manual', scroll: 'after-transition' } });
  assert.equal(document.activeElement, $('h1'), 'the router focuses (B17.8)');
  assert.equal(await router.navigate('?q=1'), 'done');
  assert.deepEqual(fake.events.at(-1)?.intercepted, { focusReset: 'manual', scroll: 'manual' }, 'search-only keeps scroll');
  fake.fire('/b?q=1#top', 'push');
  assert.deepEqual(fake.events.at(-1)?.intercepted, { focusReset: 'manual', scroll: 'after-transition' }, 'a hash change scrolls to its fragment');
  fake.fire('/c', 'push', { formData: new FormData() });
  fake.fire('/c', 'push', { downloadRequest: 'c.txt' });
  fake.fire('/nowhere', 'push');
  fake.fire('https://other.test/c', 'push');
  assert.deepEqual(fake.fullLoads, ['http://localhost/c', 'http://localhost/c', 'http://localhost/nowhere', 'https://other.test/c']);
  fake.fire('/c', 'push'); // a link or a GET form
  await settled();
  assert.equal($('h1')?.textContent, 'c');
  view.dispose();
  assert.equal(fake.listeners.size, 0, 'B17.3: disposal removes the navigate listener');
});

test('B17.18 Navigation API back(): traverses when canGoBack and the previous entry matches a route, else navigate(fallback, { replace: true })', async (t) => {
  history.replaceState(null, '', '/legacy'); // the tab arrived from a URL no route matches
  const fake = fakeNavigation(t);
  const routes = [route('/', { view: page('home').view }), route('/b', { view: page('b').view })];
  const router = createRouter(routes, opts);
  const view = mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  assert.equal(view.root.querySelector('h1')?.textContent, 'Not found');
  await router.navigate('/b');
  assert.equal(await router.back('/'), 'done');
  assert.deepEqual(fake.events.at(-1), { type: 'replace', url: 'http://localhost/', intercepted: { focusReset: 'manual', scroll: 'after-transition' } });
  await router.navigate('/b');
  assert.equal(await router.back('/nowhere'), 'done');
  assert.equal(fake.events.at(-1)?.type, 'traverse');
  assert.equal(location.pathname, '/');
  assert.equal(view.root.querySelector('h1')?.textContent, 'home');
});

test('B17.18 Navigation API back(): an entry from an earlier page load is not the app\'s, even when a route matches it (comparison P-B8)', async (t) => {
  history.replaceState(null, '', '/?book=nope'); // typed after visiting /?book=b1 in the same tab
  const fake = fakeNavigation(t, ['/?book=b1']);
  const router = createRouter([route('/', { view: page('home').view })], opts);
  mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  assert.equal(await router.back('/'), 'done');
  assert.deepEqual([fake.events.at(-1)?.type, fake.events.at(-1)?.url], ['replace', 'http://localhost/'],
    'navigate(fallback, { replace: true }), not a traversal into the earlier document');
  assert.equal(location.href, 'http://localhost/');
});

test('B17.17 Navigation API: the one full document navigation after VIEW_IMPORT_FAILED is not intercepted by the router', async (t) => {
  const fake = fakeNavigation(t);
  sessionStorage.clear();
  t.after(() => sessionStorage.clear());
  const { router } = setup(t, [route('/', { view: page('home').view }),
    route('/lazy', { view: (): Promise<ViewModule> => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) })], '/', { expect: ['VIEW_IMPORT_FAILED'] });
  await settled();
  await router.navigate('/lazy');
  await settled();
  assert.ok(fake.fullLoads.includes('http://localhost/lazy'),
    `location.assign() fired navigate and the router intercepted it: ${JSON.stringify(fake.events.map((e) => [e.type, e.url, !!e.intercepted]))}`);
});

// ================================================================ RECIPES router patterns

/** RECIPES "Detail over a list", verbatim apart from the list markup. */
function board(t: Ctx, start: string) {
  let router!: Router;
  const s = { listBuilds: 0, dialogs: 0 };
  const CardDialog = component(function CardDialog(p: { id: string }): Node {
    s.dialogs++;
    const dialog = h.dialog({ 'aria-labelledby': 'card-title', onclose: () => {   // close also fires after Back removed it
        if (router.url().searchParams.get('card') === p.id) void router.back(router.url().pathname); } },
      h.h2({ id: 'card-title' }, 'Card ', p.id), h.form({ method: 'dialog' }, h.button(null, 'Close')));
    onMount(() => { dialog.showModal(); return () => dialog.close(); });
    return dialog;
  });
  const Board = component(function Board(): Node {
    s.listBuilds++;
    const cardId = computed(() => router.url().searchParams.get('card'));
    return h.section(null, h.h1(null, 'Board'),
      h.ul(null, h.li(null, h.a({ href: '?card=1', id: 'open1' }, 'Open 1')), h.li(null, h.a({ href: '?card=2', id: 'open2' }, 'Open 2'))),
      match(cardId, (id) => (id === null ? '' : CardDialog({ id }))));
  });
  const r = setup(t, [route('/', { view: async () => ({ default: Board }) }), route('/other', { view: page('other').view })], start);
  router = r.router;
  return { ...r, s };
}

test('RECIPES Detail over a list: a ?card link opens the dialog over the mounted list; Close goes Back and focus returns to the opener', async (t) => {
  const { router, view, $, s } = board(t, '/');
  await settled();
  const len = history.length;
  const click = clicker(t);
  const opener = $<HTMLAnchorElement>('#open1')!;
  opener.focus();
  assert.equal(click(opener), true);
  await settled();
  const dialog = $<HTMLDialogElement>('dialog')!;
  assert.equal(dialog.open, true);
  assert.equal(router.url().search, '?card=1');
  assert.equal(history.length, len + 1);
  assert.equal(document.activeElement?.textContent, 'Close');
  (document.activeElement as HTMLButtonElement).click();
  await settled();
  assert.equal(location.href, 'http://localhost/');
  assert.equal(router.url().search, '');
  assert.equal($('dialog'), null);
  assert.deepEqual(s, { listBuilds: 1, dialogs: 1 });
  assert.equal(document.activeElement, opener);
  assert.deepEqual(view.diagnostics, []);
});

test('RECIPES Detail over a list: browser Back closes the dialog without rebuilding the list; focus returns to the opener', async (t) => {
  const { router, view, $, s } = board(t, '/');
  await settled();
  const click = clicker(t);
  const opener = $<HTMLAnchorElement>('#open2')!;
  opener.focus();
  click(opener);
  await settled();
  assert.equal($<HTMLDialogElement>('dialog')?.open, true);
  history.back();
  await settled();
  assert.equal(router.url().search, '');
  assert.equal($('dialog'), null);
  assert.equal(location.href, 'http://localhost/', 'onclose did not go Back a second time');
  assert.deepEqual(s, { listBuilds: 1, dialogs: 1 });
  assert.equal(document.activeElement, opener);
  assert.deepEqual(view.diagnostics, []);
});

test('RECIPES Detail over a list: a deep link opens the dialog on the first render; Close replaces the entry with the list', async (t) => {
  const { router, view, $, s } = board(t, '/?card=2');
  await settled();
  const len = history.length;
  assert.equal($<HTMLDialogElement>('dialog')?.open, true);
  assert.equal($('h2')?.textContent, 'Card 2');
  $<HTMLButtonElement>('dialog button')!.click();
  await settled();
  assert.equal(location.href, 'http://localhost/');
  assert.equal(router.url().search, '');
  assert.equal(history.length, len, 'no new entry');
  assert.equal($('dialog'), null);
  assert.deepEqual(s, { listBuilds: 1, dialogs: 1 });
  assert.deepEqual(view.diagnostics, []);
});

test('RECIPES Redirect: a guard loader navigates to /login with replace; the guarded view never renders; Back skips it', async (t) => {
  const session = signal(false);
  const admin = page('admin');
  let router!: Router;
  let r!: ReturnType<typeof setup>;
  ({ router } = r = setup(t, [
    route('/', { view: page('home', () => h.a({ href: '/admin', id: 'admin' }, 'Admin')).view }),
    route('/admin', { view: admin.view, loader: async () => { if (!session()) { void router.navigate('/login', { replace: true }); return null; } return 'secret'; } }),
    route('/login', { view: page('login').view, title: 'Sign in' }),
  ]));
  await settled();
  const len = history.length;
  clicker(t)(r.$('#admin'));
  await settled();
  assert.equal(router.url().pathname, '/login');
  assert.equal(r.$('h1')?.textContent, 'login');
  assert.equal(document.title, 'Sign in');
  assert.equal(document.activeElement, r.$('h1'));
  assert.equal(history.length, len + 1, 'the guarded entry was replaced');
  assert.equal(admin.s.builds, 0);
  assert.equal(await router.back('/'), 'done');
  assert.equal(location.pathname, '/');
  session.set(true);
  assert.equal(await router.navigate('/admin'), 'done');
  assert.equal(r.$('h1')?.textContent, 'admin');
  assert.deepEqual(r.view.diagnostics, []);
});

test('RECIPES Redirect login wall: show(session, () => router.outlet(), () => Login()) signs in without FOCUS_LOST', async (t) => {
  const session = signal(false);
  history.replaceState(null, '', '/inbox');
  const router = createRouter([route('/inbox', { view: page('Inbox').view })], opts);
  const Login = component(function Login(): Node {
    return h.form({ onsubmit: (e) => { e.preventDefault(); session.set(true); } },
      h.h1(null, 'Sign in'), h.button({ type: 'submit' }, 'Sign in'));
  });
  const view = mountTest(t, () => h.main(null, show(session, () => router.outlet(), () => Login())));
  await settled();
  const button = view.root.querySelector('button')!;
  button.focus(); // the user activates the submit button
  button.click();
  await settled();
  assert.equal(view.root.querySelector('h1')?.textContent, 'Inbox');
  // The flush removed the focused button, so the outlet's first render focuses like a navigation (B17.3).
  assert.equal(document.activeElement?.textContent, 'Inbox');
  const codes = view.diagnostics.map((d) => d.code);
  assert.deepEqual(codes, [], `diagnostics: ${codes.join(', ')}; focus on <${document.activeElement?.localName}>`);
});

test('B17.3 an outlet that an async gate shows on page load (focus on body) stays quiet: no focus move, no announcement', async (t) => {
  const ready = signal(false);
  history.replaceState(null, '', '/inbox');
  const router = createRouter([route('/inbox', { view: page('Inbox').view })], opts);
  const view = mountTest(t, () => h.main(null, show(ready, () => router.outlet(), () => h.p(null, 'Loading'))));
  await settled();
  (document.activeElement as HTMLElement | null)?.blur();
  const before = liveRegions().length;
  setTimeout(() => ready.set(true)); // the session check resolves
  await new Promise((r) => setTimeout(r, 0));
  await settled();
  assert.equal(view.root.querySelector('h1')?.textContent, 'Inbox');
  assert.equal(document.activeElement?.localName, 'body');
  assert.equal(liveRegions().length, before);
  assert.deepEqual(view.diagnostics, []);
});

test('RECIPES Tabs: :tab(profile|billing) + match on p.params().tab swaps the body and keeps the view; other tabs are notFound', async (t) => {
  let builds = 0;
  const Settings = component(function Settings(p: P): Node {
    builds++;
    return h.section(null, h.h1(null, 'Settings'),
      h.nav(null, h.a({ href: router.href('/settings/:tab(profile|billing)', { tab: 'profile' }), id: 'profile' }, 'Profile'),
        h.a({ href: router.href('/settings/:tab(profile|billing)', { tab: 'billing' }), id: 'billing' }, 'Billing')),
      match(() => p.params().tab as 'profile' | 'billing', (tab) => (tab === 'profile' ? h.p({ id: 'body' }, 'Your profile') : h.p({ id: 'body' }, 'Your invoices'))));
  });
  let router!: Router;
  let r!: ReturnType<typeof setup>;
  ({ router } = r = setup(t, [route('/settings/:tab(profile|billing)', { view: async () => ({ default: Settings as ViewModule['default'] }) })], '/settings/profile'));
  await settled();
  assert.equal(r.$('#body')?.textContent, 'Your profile');
  assert.equal(r.$('#billing')?.getAttribute('href'), '/settings/billing');
  const click = clicker(t);
  r.$('#billing')!.focus();
  assert.equal(click(r.$('#billing')), true);
  await settled();
  assert.equal(r.$('#body')?.textContent, 'Your invoices');
  assert.equal(builds, 1);
  assert.equal(document.activeElement, r.$('h1'), 'a params change is a navigation: focus on the h1');
  assert.equal(await router.navigate('/settings/other'), 'done');
  assert.equal(r.$('h1')?.textContent, 'Not found');
  assert.deepEqual(r.view.diagnostics, []);
});

test('RECIPES Per-param lifecycle: match on p.params().id restarts the subscription per id, with zero diagnostics', async (t) => {
  const log: string[] = [];
  const presence: Record<string, string[]> = { a: ['ann'], b: ['bob', 'bea'] };
  function subscribePresence(roomId: string, cb: (users: readonly string[]) => void): () => void {
    log.push(`sub ${roomId}`);
    cb(presence[roomId]!); // a synchronous first callback
    return () => { log.push(`unsub ${roomId}`); };
  }
  const RoomBody = component(function RoomBody(p: { roomId: string }): Node {
    const online = signal<readonly string[]>([]);
    onMount(() => subscribePresence(p.roomId, online.set));
    return h.p({ id: 'online' }, () => online().join(','));
  });
  let builds = 0;
  const Room = component(function Room(p: P): Node {
    builds++;
    return h.section(null, h.h1(null, () => `Room ${p.params().roomId}`), match(() => p.params().roomId as string, (id) => RoomBody({ roomId: id })));
  });
  const { router, view, $ } = setup(t, [route('/rooms/:roomId', { view: async () => ({ default: Room as ViewModule['default'] }) })], '/rooms/a');
  await settled();
  assert.equal($('#online')?.textContent, 'ann');
  await router.navigate('/rooms/b');
  assert.equal($('#online')?.textContent, 'bob,bea');
  assert.equal($('h1')?.textContent, 'Room b');
  assert.equal(builds, 1);
  assert.deepEqual(log, ['sub a', 'unsub a', 'sub b']);
  view.dispose();
  assert.deepEqual(log, ['sub a', 'unsub a', 'sub b', 'unsub b']);
  assert.deepEqual(view.diagnostics, []);
});

// ================================================================ RECIPES Route tests: the example app

// The example lives in the design package ('#api' resolves from its package.json); its router is module-level.
const exampleApp = '../../../design/example/src/app.ts';
const exampleRoutes = '../../../design/example/src/routes.ts';

test('RECIPES Route tests: the example App from a deep link, link navigation, notFound and the error view, zero diagnostics', async (t) => {
  const { App } = await import(exampleApp) as { App: () => Node };
  const { router } = await import(exampleRoutes) as { router: Router };
  history.replaceState(null, '', '/users/1');
  const view = mountTest(t, () => App());
  await settled();
  const $ = (sel: string) => view.root.querySelector<HTMLElement>(sel);
  assert.equal($('main h1')?.textContent, 'Ada Lovelace');
  assert.equal(document.title, 'Ada Lovelace');
  assert.match($('main')?.textContent ?? '', /Send the Bernoulli table/);
  assert.equal($('progress'), null);

  const click = clicker(t);
  $('main a[href="/"]')!.focus(); // as a user click would: the removed link must not drop focus (FOCUS_LOST)
  assert.equal(click($('main a[href="/"]')), true, 'All people');
  await settled();
  assert.equal($('main h1')?.textContent, 'People');
  assert.equal(document.title, 'People');
  assert.equal(document.activeElement, $('main h1'));
  assert.equal(liveRegions().at(-1)?.textContent, 'People');

  $('main a[href="/users/2"]')!.focus();
  assert.equal(click($('main a[href="/users/2"]')), true);
  await settled();
  assert.equal($('main h1')?.textContent, 'Alan Turing');
  assert.equal(document.activeElement, $('main h1'));
  assert.equal(liveRegions().at(-1)?.textContent, 'Alan Turing');

  history.back();
  await settled();
  assert.equal($('main h1')?.textContent, 'People');

  assert.equal(await router.navigate('/nowhere'), 'done');
  assert.equal($('main h1')?.textContent, 'Page not found');
  assert.equal(document.title, 'Page not found');

  assert.equal(await router.navigate('/users/999'), 'failed');
  assert.equal($('main [role=alert] h1')?.textContent, 'Something went wrong');
  assert.equal(document.activeElement, $('main [role=alert] h1'));
  await settled(); // the FOCUS_LOST check of the isLoading flush runs in a microtask: let it see the focused h1
  assert.deepEqual(view.diagnostics, []);
  (document.activeElement as HTMLElement).blur();
  view.dispose();
  history.replaceState(null, '', '/');
});
