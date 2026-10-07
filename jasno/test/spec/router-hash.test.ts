// Spec conformance: hash mode, createRouter(routes, { hash: true }) (design.md B17.19, ADR-21). The app is served at a
// fixed document (/app/ here); the route lives in the fragment. History adapter, as in every browser in hash mode.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { component, h, type Read } from '@jasno/core';
import { createRouter, route } from '@jasno/core/router';
import { mountTest, settled } from '@jasno/core/testing';
import { capture } from '../helpers.ts';

type Ctx = TestContext;
type Routes = Parameters<typeof createRouter>[0];
type ViewModule = { default: (p: any) => Node }; // eslint-disable-line @typescript-eslint/no-explicit-any -- one module shape for every pattern
type P = { params: Read<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

function page(name: string) {
  const s = { imports: 0, builds: 0 };
  const View = component(function Page(p: P): Node {
    s.builds++;
    return h.section(null, h.h1(null, name), h.p({ class: 'params' }, () => JSON.stringify(p.params())));
  });
  return { s, view: async (): Promise<ViewModule> => { s.imports++; return { default: View as ViewModule['default'] }; } };
}

const notFound = () => h.section(null, h.h1(null, 'Not found'));
const errorView = (e: unknown) => h.section({ role: 'alert' }, h.h1(null, 'Error'), h.p(null, String((e as Error)?.message ?? e)));

function setup(t: Ctx, routes: Routes, start: string, shell: (outlet: Node) => Node = (x) => h.main(null, x)) {
  history.replaceState(null, '', start);
  const router = createRouter(routes, { error: errorView, notFound, hash: true });
  const view = mountTest(t, () => shell(router.outlet()));
  const $ = (sel: string) => view.root.querySelector<HTMLElement>(sel);
  return { router, view, $ };
}

/** Clicks a link; returns whether the router took it. Stops happy-dom from following links the router left alone. */
function clicker(t: Ctx) {
  let prevented = false;
  const stop = (e: Event) => { prevented = e.defaultPrevented; e.preventDefault(); };
  window.addEventListener('click', stop);
  t.after(() => window.removeEventListener('click', stop));
  return (el: Element | null): boolean => {
    assert.ok(el, 'element to click');
    prevented = false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    return prevented;
  };
}

const users = () => {
  const home = page('home'), user = page('user');
  return { home, user, routes: [route('/', { view: home.view }), route('/users/:id', { view: user.view })] };
};

test('B17.19 the route comes from the fragment; url() is the route URL; the document path stays', async (t) => {
  const { routes } = users();
  const { router, $ } = setup(t, routes, '/app/?x=1#/users/a%20b?tab=2');
  await settled();
  assert.equal($('h1')?.textContent, 'user');
  assert.equal($('.params')?.textContent, '{"id":"a b"}');
  assert.equal(router.url().pathname, '/users/a%20b');
  assert.equal(router.url().searchParams.get('tab'), '2');
  assert.equal(router.url().origin, location.origin);
  assert.equal(location.pathname + location.search, '/app/?x=1', 'the document URL is untouched');
});

test('B17.19 an empty fragment, "#" and a fragment without its leading slash', async (t) => {
  for (const [start, h1] of [['/app/', 'home'], ['/app/#', 'home'], ['/app/#/', 'home'], ['/app/#users/7', 'user']] as const) {
    const { routes } = users();
    const { view, $ } = setup(t, routes, start);
    await settled();
    assert.equal($('h1')?.textContent, h1, start);
    view.dispose();
  }
});

test('RECIPES Menu: aria-current compares url().pathname with the route path: "page" on it, "true" below it', async (t) => {
  history.replaceState(null, '', '/app/#/users/7');
  const router = createRouter([route('/', { view: page('home').view }), route('/users', { view: page('users').view }),
    route('/users/:id', { view: page('user').view })], { error: errorView, notFound, hash: true });
  const NavLink = component(function NavLink(p: { path: '/' | '/users'; label: string }): Node {
    return h.a({ href: router.href(p.path), 'aria-current': () => {
      const here = router.url().pathname;
      return here === p.path ? 'page' : here.startsWith(p.path + '/') ? 'true' : null;
    } }, p.label);
  });
  const view = mountTest(t, () => h.div(null, h.nav(null, NavLink({ path: '/', label: 'Home' }), NavLink({ path: '/users', label: 'Users' })),
    h.main(null, router.outlet())));
  const current = () => [...view.root.querySelectorAll('nav a')].map((a) => a.getAttribute('aria-current'));
  await settled();
  assert.deepEqual(current(), [null, 'true']);
  await router.navigate('/users');
  assert.deepEqual(current(), [null, 'page']);
  await router.navigate('/');
  assert.deepEqual(current(), ['page', null]);
});

test('B17.19 href() returns a fragment; a click on it navigates inside the document', async (t) => {
  const { routes, user } = users();
  const click = clicker(t);
  history.replaceState(null, '', '/app/');
  const router = createRouter(routes, { error: errorView, notFound, hash: true });
  mountTest(t, () => h.div(null, h.nav(null, h.a({ href: router.href('/users/:id', { id: 7 }), id: 'u7' }, 'User 7')), h.main(null, router.outlet())));
  await settled();
  const a = document.getElementById('u7')!;
  assert.equal(a.getAttribute('href'), '#/users/7');
  a.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  await settled();
  assert.equal(user.s.imports, 1, 'intent preload on a fragment link');
  assert.equal(click(a), true, 'the router takes the click');
  await settled();
  assert.equal(location.href, 'http://localhost/app/#/users/7');
  assert.equal(document.querySelector('main h1')?.textContent, 'user');
  assert.equal(router.url().pathname, '/users/7');
});

test('B17.19 navigate(): route paths, href() results, search-only changes and absolute URLs', async (t) => {
  sessionStorage.clear();
  const assigned: string[] = [];
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  const { routes, user } = users();
  const { router, $ } = setup(t, routes, '/app/');
  await settled();
  assert.equal(await router.navigate('/users/8'), 'done');
  assert.equal(location.href, 'http://localhost/app/#/users/8');
  assert.equal(await router.navigate(router.href('/users/:id', { id: 9 })), 'done');
  assert.equal(location.href, 'http://localhost/app/#/users/9');
  const builds = user.s.builds, length = history.length;
  void router.navigate('?q=a%20b', { replace: true });
  assert.equal(router.url().searchParams.get('q'), 'a b', 'url() updates before navigate() returns');
  assert.equal(location.href, 'http://localhost/app/#/users/9?q=a%20b');
  assert.equal(history.length, length, 'replace adds no entry');
  await settled();
  assert.equal(user.s.builds, builds, 'search-only: no rebuild');
  assert.equal(await router.navigate(router.href('/users/:id', { id: 9 }) + '#intro'), 'done');
  assert.equal(location.hash, '#/users/9#intro', 'the route keeps its own fragment');
  assert.equal(router.url().hash, '#intro');
  assert.equal(user.s.builds, builds, 'hash-only: no rebuild');
  assert.equal(await router.navigate('http://localhost/app/#/'), 'done', 'an absolute URL of this document');
  assert.equal($('h1')?.textContent, 'home');
  await router.navigate('http://localhost/other');
  await router.navigate('https://example.com/');
  assert.deepEqual(assigned, ['http://localhost/other', 'https://example.com/'], 'another document loads normally');
  assert.equal(location.href, 'http://localhost/app/#/');
});

test('B17.19 every fragment of the document is the app\'s: an unmatched one renders notFound; other documents load', async (t) => {
  const { routes } = users();
  const click = clicker(t);
  setup(t, routes, '/app/', (x) => h.div(null, h.nav(null,
    h.a({ href: '#/nope', id: 'nope' }, 'Nope'),
    h.a({ href: '/other/', id: 'other' }, 'Other'),
    h.a({ href: '?q=x', id: 'query' }, 'Query')), h.main(null, x)));
  await settled();
  assert.equal(click(document.getElementById('nope')), true);
  await settled();
  assert.equal(document.querySelector('main h1')?.textContent, 'Not found');
  assert.equal(location.href, 'http://localhost/app/#/nope');
  assert.equal(click(document.getElementById('other')), false, 'another path is another document');
  assert.equal(click(document.getElementById('query')), false, 'another query is another document');
});

test('B17.19 Back, Forward and an address-bar fragment edit (popstate) render their routes', async (t) => {
  const { routes } = users();
  const { router, $ } = setup(t, routes, '/app/');
  await settled();
  await router.navigate('/users/1');
  history.back();
  await settled();
  assert.equal($('h1')?.textContent, 'home');
  history.forward();
  await settled();
  assert.equal($('.params')?.textContent, '{"id":"1"}');
  // An edit in the address bar: the browser adds the entry, then fires popstate (happy-dom fires only hashchange).
  history.pushState(null, '', '/app/#/users/2');
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  await settled();
  assert.equal($('.params')?.textContent, '{"id":"2"}');
  assert.equal(router.url().pathname, '/users/2');
});

test('B17.19 a fragment cannot leave the origin: //host and \\\\host stay paths of this document', async (t) => {
  const click = clicker(t);
  for (const frag of ['//evil.example/x', '/\\evil.example/x', '\\\\evil.example']) {
    const { routes } = users();
    const { router, view } = setup(t, routes, '/app/#' + frag);
    await settled();
    assert.equal(router.url().origin, location.origin, frag);
    assert.equal(document.querySelector('main h1')?.textContent, 'Not found', frag);
    view.dispose();
  }
  const { routes } = users();
  setup(t, routes, '/app/', (x) => h.div(null, h.a({ href: '#//evil.example/', id: 'evil' }, 'x'), h.main(null, x)));
  await settled();
  assert.equal(click(document.getElementById('evil')), true);
  await settled();
  assert.equal(location.origin + location.pathname, 'http://localhost/app/');
});

test('B17.19 a view import TypeError reloads the document (assigning the fragment would not)', async (t) => {
  sessionStorage.clear();
  const assigned: string[] = [];
  let reloads = 0;
  t.mock.method(location, 'assign', (u: string) => { assigned.push(u); });
  t.mock.method(location, 'reload', () => { reloads++; });
  const cap = capture();
  setup(t, [route('/', { view: page('home').view }),
    route('/lazy', { view: (): Promise<ViewModule> => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) })], '/app/#/lazy');
  await settled();
  cap.stop();
  assert.deepEqual([reloads, assigned], [1, []]);
  assert.deepEqual(cap.codes(), ['VIEW_IMPORT_FAILED']);
  sessionStorage.clear();
});

test('B17.19 __JASNO__.router().url is the address-bar URL', async (t) => {
  const { routes } = users();
  setup(t, routes, '/app/#/users/3');
  await settled();
  const dev = (globalThis as unknown as { __JASNO__: { router(): { url: string } } }).__JASNO__;
  assert.equal(dev.router().url, 'http://localhost/app/#/users/3');
});
