// Spec conformance: router patterns (design.md B17.1 validation and ROUTE_SHADOWED, B17.2 grammar and matching,
// B17.14 href).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { component, h, type Read } from 'jasno';
import { createRouter, route } from 'jasno/router';
import { mountTest, settled } from 'jasno/testing';
import { capture, codeOf } from '../helpers.ts';

/** A view whose h1 is the pattern and whose .params shows the params as JSON. */
const V = (name: string) => async () => ({
  default: component(function RouteView(p: { params: Read<Record<string, string>> }): Node {
    return h.section(null, h.h1(null, name), h.p({ class: 'params' }, () => JSON.stringify(p.params())));
  }),
});
const errorView = (e: unknown) => h.section({ role: 'alert' }, h.h1(null, 'Error'), h.p(null, String((e as Error)?.message ?? e)));
const notFound = () => h.section(null, h.h1(null, 'Not found'));
const NF = 'Not found';

const make = (patterns: readonly string[]) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime probes of arbitrary patterns
  createRouter(patterns.map((p) => route(p as `/${string}`, { view: V(p) as any })), { error: errorView, notFound });

/** Mounts a router over the patterns; at(url) navigates and returns the rendered route (h1) and params. */
async function mounted(t: Parameters<typeof mountTest>[0], patterns: readonly string[], start = '/') {
  history.replaceState(null, '', start);
  const router = make(patterns);
  const view = mountTest(t, () => h.main(null, router.outlet()));
  await settled();
  const state = () => {
    const params = view.root.querySelector('.params')?.textContent;
    return { route: view.root.querySelector('h1')?.textContent, params: params ? JSON.parse(params) as Record<string, string> : undefined };
  };
  const at = async (url: string) => {
    const result = await router.navigate(url);
    return { result, ...state() };
  };
  return { router, view, at, state };
}

/** Runs every check and fails once with the list of mismatches (a finding reports all its sub-cases). */
async function all(checks: [string, () => unknown][]) {
  const bad: string[] = [];
  for (const [name, fn] of checks) {
    try { await fn(); } catch (e) { bad.push(`${name}: ${e instanceof assert.AssertionError ? `got ${JSON.stringify(e.actual)}` : String(e)}`); }
  }
  assert.deepEqual(bad, []);
}

const throwsCode = (fn: () => unknown, code: string, msg: string) =>
  assert.throws(fn, (e) => codeOf(e) === code, msg);

// ---------------------------------------------------------------- B17.1 validation

test('B17.1 INVALID_ROUTE_PATTERN for every unsupported pattern, with the catalogue message; route() itself is inert', () => {
  const bad = [
    '', 'a', 'users/:id', '//', '/a/', '/a//b', '/:', '/:1x', '/:x-y', '/:x()', '/:x(a', '/:x(()', '/:x([)', '/:x?+', '/:x(a)?',
    '/:x*/y', '/a/:x+/b', '/:x/:x?', '/a/:id/:id(\\d+)', '/a:b', '/a*', '/a(b)', '/a?', '/a+',
  ];
  for (const p of bad) {
    const r = route(p as '/', { view: V(p) }); // route() does not validate
    assert.throws(() => createRouter([r], { error: errorView, notFound }), (e) => {
      const d = (e as { diag?: { code: string; message: string; hint: string } }).diag;
      return d?.code === 'INVALID_ROUTE_PATTERN' && d.message.startsWith(`[INVALID_ROUTE_PATTERN] Route pattern "${p}" is not supported: `);
    }, JSON.stringify(p));
  }
});

test('B17.1 valid patterns are accepted: statics with metacharacters/unicode, all param forms, regex constraints', () => {
  const ok = [
    '/', '/a', '/a/b/c', '/file.json', '/$x', '/a-b_c~d', '/über', '/日本', '/a b', "/it's", '/a=b@c!',
    '/:x?', '/a/:x', '/a/:x?', '/a/:x+', '/a/:x*', '/a/:x?/b', '/a/:x?/:y?', '/:a/:b',
    '/v/:x(\\d+)', '/v/:x(a|b)', '/v/:x(v\\d+\\.\\d+)', '/v/:x(\\d{2,3})', '/v/:x([a-f]+)', '/v/:x(colou?r)', '/v/:x((a|b)c)',
    '/v/:$x', '/v/:_x1',
  ];
  for (const p of ok) make([p]);
});

test('B17.1 a pattern that matches every path is rejected with the hint "use notFound"', () => {
  for (const p of ['/:x*', '/:x+', '/:rest*', '/:$+']) {
    assert.throws(() => make([p]), (e) => {
      const d = (e as { diag?: { code: string; hint: string } }).diag;
      return d?.code === 'INVALID_ROUTE_PATTERN' && /use notFound/.test(d.hint);
    }, p);
  }
  make(['/:x?']); // '/' and one segment: not every path
  make(['/a/:x*']);
});

test('B17.1: catch-all patterns other than a lone splat (/:x?/:rest* matches every path) are rejected', async () => {
  // '/:x?/:rest*' matches '/', '/a' and '/a/b/c': every path. '/:x/:rest*' matches exactly what '/:x+' matches.
  await all(['/:x?/:rest*', '/:x/:rest*', '/:x?/:rest+'].map((p) => [p, () =>
    assert.throws(() => make([p]), (e) => codeOf(e) === 'INVALID_ROUTE_PATTERN' && /notFound/.test(String(e)))]));
});

test('B17.1 ROUTE_SHADOWED uses the catalogue message naming both patterns (first covering route), and the hint', () => {
  assert.throws(() => make(['/x', '/u/:id', '/u/:any', '/u/new']), (e) => {
    const d = (e as { diag?: { code: string; message: string; hint: string } }).diag;
    return d?.code === 'ROUTE_SHADOWED'
      && d.message.startsWith('[ROUTE_SHADOWED] Route "/u/:any" can never match: "/u/:id" comes first and matches all of its paths.')
      && d.hint === 'List specific routes (/users/new) before param routes (/users/:id).';
  });
});

test('B17.1 ROUTE_SHADOWED for tables where an earlier route matches all paths of a later one', () => {
  const shadowed: [string, string][] = [
    ['/a', '/a'], ['/', '/'], ['/über', '/über'],
    ['/users/:id', '/users/new'], ['/:a/:b', '/x/y'], ['/u/:id/edit', '/u/new/edit'], ['/o/:x/:y', '/o/new/:z(\\d+)'],
    // an unconstrained param covers a constrained one; a constraint covers the same constraint
    ['/o/:x', '/o/:y(\\d+)'], ['/o/:x(\\d+)', '/o/:y(\\d+)'], ['/o/:x((a|b)c)', '/o/:y((a|b)c)'],
    // optional segments: absent and present
    ['/p/:x?', '/p'], ['/p/:x?', '/p/:y'], ['/p/:x?', '/p/new'], ['/p/:x?', '/p/:y(\\d+)'], ['/a/:x?', '/a/:y?'],
    ['/p/:x?/:y?', '/p/:z?'], ['/f/:a?/x', '/f/x'], ['/f/:a?/x', '/f/y/x'], ['/f/:a?/:b', '/f/:c'], ['/', '/'],
    // splats cover the rest
    ['/d/:r*', '/d'], ['/d/:r*', '/d/:x/:y'], ['/d/:r*', '/d/:s+'], ['/d/:r*', '/d/:x?/:y*'], ['/d/:r+', '/d/a/b/c'],
    ['/d/:r+', '/d/:x(\\d+)/b'], ['/d/:r+', '/d/b/:x?/:y*'], ['/f/:a?/:r+', '/f/:x'],
  ];
  for (const [a, b] of shadowed) {
    assert.throws(() => make([a, b]), (e) => codeOf(e) === 'ROUTE_SHADOWED' && String(e).includes(`"${a}"`) && String(e).includes(`"${b}"`), `${a} then ${b}`);
  }
});

test('B17.1 no false ROUTE_SHADOWED on correct tables (exact coverage rules)', () => {
  const fine: [string, string][] = [
    ['/users/new', '/users/:id'], ['/o/:x(\\d+)', '/o/:y'], ['/q/:x(a|b)', '/q/:y(a|c)'], ['/t/:x(\\d+)', '/t/:y(\\d+|x)'],
    ['/p/:x', '/p/:x?'], ['/o/:x', '/o/:y?'], ['/x/:a', '/x/:a/:b?'], ['/', '/:x?'], ['/p/:x?', '/p/:x/:y'],
    ['/d/:r+', '/d'], ['/d/:r+', '/d/:r*'], ['/d/:r+', '/d/:x?'], ['/d/:x', '/d/:r+'], ['/d/:x/:y', '/d/:r+'],
    ['/a', '/a/:x'], ['/a/:x', '/a'], ['/a/b', '/a/:x/c'], ['/f/:a?/x', '/f/x/y'], ['/Users', '/users'], ['/über', '/uber'],
    // ":x(c) covers only the same constraint" and "a static segment covers only the same static segment"
    ['/t/:x(a|b)', '/t/a'], ['/t/a', '/t/:x(a)'], ['/t/:x(a|b)', '/t/:y(b|a)'],
    ['/a/:x', '/b/:x'], ['/a/b/c', '/a/b'], ['/a/:x/c', '/a/:x/d'],
  ];
  for (const [a, b] of fine) {
    try { make([a, b]); } catch (e) { assert.fail(`${a} then ${b}: ${String(e)}`); }
  }
  make(['/users/new', '/users/:id/edit', '/users/:id', '/docs/:path+', '/docs', '/settings/:tab(profile|billing)', '/settings/:tab', '/']);
});

test('B17.1 createRouter returns an inert router: no link interception, no history or title writes, navigate() throws', () => {
  history.replaceState(null, '', '/start');
  document.title = 'Inert';
  const router = make(['/a']);
  const a = document.createElement('a');
  a.href = '/a';
  document.body.append(a);
  let prevented: boolean | undefined;
  const stop = (e: Event) => { prevented = e.defaultPrevented; e.preventDefault(); };
  window.addEventListener('click', stop);
  try { a.click(); } finally { window.removeEventListener('click', stop); a.remove(); }
  assert.equal(prevented, false, 'the click is left alone');
  assert.equal(location.pathname, '/start');
  assert.equal(history.state, null);
  assert.equal(document.title, 'Inert');
  throwsCode(() => router.navigate('/a'), 'ROUTER_NOT_STARTED', 'navigate before outlet');
  throwsCode(() => router.back('/a'), 'ROUTER_NOT_STARTED', 'back before outlet');
  assert.equal(router.href('/a'), '/a', 'href works without outlet');
  history.replaceState(null, '', '/');
});

// ---------------------------------------------------------------- B17.2 grammar and matching

test('B17.2 the first matching route in table order wins', async (t) => {
  const { at } = await mounted(t, ['/users/new', '/users/:id', '/a/:x(\\d+)', '/a/:y', '/f/:a?/x', '/f/:b/:c'], '/users/new');
  assert.deepEqual(await at('/users/new'), { result: 'done', route: '/users/new', params: {} });
  assert.deepEqual(await at('/users/7'), { result: 'done', route: '/users/:id', params: { id: '7' } });
  assert.deepEqual(await at('/a/12'), { result: 'done', route: '/a/:x(\\d+)', params: { x: '12' } });
  assert.deepEqual(await at('/a/zz'), { result: 'done', route: '/a/:y', params: { y: 'zz' } });
  assert.deepEqual(await at('/f/x'), { result: 'done', route: '/f/:a?/x', params: {} });
  assert.deepEqual(await at('/f/z/x'), { result: 'done', route: '/f/:a?/x', params: { a: 'z' } });
  assert.deepEqual(await at('/f/z/y'), { result: 'done', route: '/f/:b/:c', params: { b: 'z', c: 'y' } });
});

test('B17.2 matching is case-sensitive for statics; param values keep their case', async (t) => {
  const { at } = await mounted(t, ['/about', '/users/:id', '/über']);
  assert.equal((await at('/About')).route, NF);
  assert.equal((await at('/ABOUT')).route, NF);
  assert.deepEqual((await at('/users/AbC')).params, { id: 'AbC' });
  assert.equal((await at('/Users/1')).route, NF);
  assert.equal((await at('/Über')).route, NF);
  assert.equal((await at('/über')).route, '/über');
});

test('B17.2 a trailing slash is optional (one, not two); an empty segment does not match', async (t) => {
  const { at } = await mounted(t, ['/', '/a', '/a/b', '/u/:id', '/lang/:code?', '/n/:n(\\d+)'], '/x');
  assert.equal((await at('/')).route, '/');
  assert.equal((await at('/a/')).route, '/a');
  assert.equal((await at('/a/b/')).route, '/a/b');
  assert.deepEqual((await at('/u/1/')).params, { id: '1' });
  assert.deepEqual((await at('/lang/')), { result: 'done', route: '/lang/:code?', params: {} });
  assert.deepEqual((await at('/lang/ru/')).params, { code: 'ru' });
  assert.deepEqual((await at('/n/42/')).params, { n: '42' });
  assert.equal((await at('/a//')).route, NF);
  assert.equal((await at('/u//1')).route, NF);
  assert.equal((await at('/u/')).route, NF, 'a required param needs a segment');
});

test('B17.2 params are decoded with decodeURIComponent; + and * params keep their /', async (t) => {
  const { at } = await mounted(t, ['/u/:id', '/docs/:path+', '/opt/:p*'], '/u/1');
  assert.deepEqual((await at('/u/a%20b')).params, { id: 'a b' });
  assert.deepEqual((await at('/u/a%2Fb')).params, { id: 'a/b' });
  assert.deepEqual((await at('/u/a+b')).params, { id: 'a+b' }, '+ is not a space in a path');
  assert.deepEqual((await at('/u/a%2Bb')).params, { id: 'a+b' });
  assert.deepEqual((await at('/u/%E2%9C%93')).params, { id: '✓' });
  assert.deepEqual((await at('/u/%c3%a9')).params, { id: 'é' }, 'lowercase hex');
  assert.deepEqual((await at('/u/é')).params, { id: 'é' }, 'the URL parser encodes, the router decodes');
  assert.deepEqual((await at('/u/%3F%23%25')).params, { id: '?#%' });
  assert.deepEqual((await at('/u/100%25')).params, { id: '100%' });
  assert.deepEqual((await at('/docs/a%20b/c%2Fd/e')).params, { path: 'a b/c/d/e' });
  assert.deepEqual((await at('/opt/x/y')).params, { p: 'x/y' });
  assert.deepEqual((await at('/opt')), { result: 'done', route: '/opt/:p*', params: {} });
});

test('B17.2: a trailing slash is not part of a + or * param', async (t) => {
  const { at } = await mounted(t, ['/docs/:path+', '/opt/:p*'], '/docs/a');
  await all([
    ['/docs/a/b/', async () => assert.deepEqual((await at('/docs/a/b/')).params, { path: 'a/b' })],
    ['/docs/a/', async () => assert.deepEqual((await at('/docs/a/')).params, { path: 'a' })],
    ['/opt/x/', async () => assert.deepEqual((await at('/opt/x/')).params, { p: 'x' })],
  ]);
});

test('B17.2 malformed percent-encoding renders notFound without throwing or reporting', async (t) => {
  const c = capture();
  t.after(() => c.stop());
  const { at } = await mounted(t, ['/u/:id', '/docs/:path+', '/t/:x(.+)'], '/u/1');
  for (const url of ['/u/%E0%A4%A', '/u/%', '/u/%zz', '/u/%C3', '/docs/a/%ZZ/b', '/t/%E0']) {
    assert.deepEqual(await at(url), { result: 'done', route: NF, params: undefined }, url);
  }
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.codes(), []);
  assert.deepEqual((await at('/u/ok')).params, { id: 'ok' }, 'the router still works');
});

test('B17.2 a malformed start URL renders notFound', async (t) => {
  const { state } = await mounted(t, ['/u/:id'], '/u/%E0%A4%A');
  assert.equal(state().route, NF);
});

test('B17.2 regex constraints: metacharacters, quantifiers, classes, alternations are whole-segment matches', async (t) => {
  const { at } = await mounted(t, [
    '/v/:ver(v\\d+\\.\\d+)', '/n/:n(\\d{2,3})', '/h/:h([a-f0-9]+)', '/c/:c(colou?r)', '/e/:e(a|b|cd)', '/dot/:d(\\.)', '/g/:g((ab)+)',
  ], '/v/v1.2');
  assert.deepEqual((await at('/v/v1.2')).params, { ver: 'v1.2' });
  assert.equal((await at('/v/v1x2')).route, NF, 'the escaped dot is literal');
  assert.deepEqual((await at('/n/12')).params, { n: '12' });
  assert.deepEqual((await at('/n/123')).params, { n: '123' });
  assert.equal((await at('/n/1')).route, NF);
  assert.equal((await at('/n/1234')).route, NF);
  assert.deepEqual((await at('/h/beef01')).params, { h: 'beef01' });
  assert.equal((await at('/h/BEEF')).route, NF, 'constraints are case-sensitive');
  assert.deepEqual((await at('/c/color')).params, { c: 'color' });
  assert.deepEqual((await at('/c/colour')).params, { c: 'colour' });
  assert.equal((await at('/c/colouur')).route, NF);
  for (const v of ['a', 'b', 'cd']) assert.deepEqual((await at(`/e/${v}`)).params, { e: v });
  for (const v of ['ab', 'xa', 'bx', 'c', 'cdx', 'acd']) assert.equal((await at(`/e/${v}`)).route, NF, `alternation anchored per alternative: ${v}`);
  assert.deepEqual((await at('/dot/.x')).route, NF);
  assert.deepEqual((await at('/g/abab')).params, { g: 'abab' });
  assert.equal((await at('/g/aba')).route, NF);
});

test('B17.2: a capture group inside a constraint does not shift the params after it', async (t) => {
  const { at } = await mounted(t, ['/v/:ver(v(\\d+))/:page', '/t/:tab((a|b)c)/:id/:rest+'], '/v/v2/intro');
  await all([
    ['/v/v2/intro', async () => assert.deepEqual((await at('/v/v2/intro')).params, { ver: 'v2', page: 'intro' })],
    ['/t/ac/7/x/y', async () => assert.deepEqual((await at('/t/ac/7/x/y')).params, { tab: 'ac', id: '7', rest: 'x/y' })],
  ]);
});

test('B17.2: a constraint tests one segment, so it swallows neither the trailing slash nor the next optional segment', async (t) => {
  // [^.]+ ("no dot") is a single-segment constraint; the router's regex lets it run across "/" and then rejects the match.
  const { at } = await mounted(t, ['/f/:name([^.]+)', '/g/:name([^.]+)/:tab?', '/s/:name([^.]+)/:rest*'], '/f/abc');
  await all([
    ['/f/abc/', async () => assert.deepEqual((await at('/f/abc/')), { result: 'done', route: '/f/:name([^.]+)', params: { name: 'abc' } })],
    ['/g/abc/info', async () => assert.deepEqual((await at('/g/abc/info')), { result: 'done', route: '/g/:name([^.]+)/:tab?', params: { name: 'abc', tab: 'info' } })],
    ['/s/abc/x/y', async () => assert.deepEqual((await at('/s/abc/x/y')), { result: 'done', route: '/s/:name([^.]+)/:rest*', params: { name: 'abc', rest: 'x/y' } })],
  ]);
});

test('B17.2: anchors in a constraint work (the constraint tests one whole decoded segment)', async (t) => {
  const { at } = await mounted(t, ['/t/:id(^\\d+$)', '/a/:x(^a|b$)'], '/t/12');
  await all([
    ['/t/12', async () => assert.deepEqual((await at('/t/12')).params, { id: '12' })],
    ['/a/a', async () => assert.deepEqual((await at('/a/a')).params, { x: 'a' })],
  ]);
});

test('B17.2 unicode static segments match both the raw and the percent-encoded URL', async (t) => {
  const { at } = await mounted(t, ['/über', '/日本/:x', '/a b'], '/über');
  assert.equal((await at('/%C3%BCber')).route, '/über');
  assert.deepEqual((await at('/日本/東京')).params, { x: '東京' });
  assert.deepEqual((await at('/%E6%97%A5%E6%9C%AC/%E6%9D%B1')).params, { x: '東' });
  assert.equal((await at('/a%20b')).route, '/a b');
  assert.equal((await at('/a b')).route, '/a b');
});

test('B17.2: static segments with characters the URL parser leaves unencoded (| [ ]) match their own URL', async (t) => {
  const { router, at } = await mounted(t, ['/x|y', '/[id]'], '/');
  assert.equal(router.href('/x|y'), '/x|y');
  await all([
    ['/x|y', async () => assert.equal((await at(router.href('/x|y'))).route, '/x|y')],
    ['/[id]', async () => assert.equal((await at(router.href('/[id]'))).route, '/[id]')],
    ['/x%7Cy (encoded form)', async () => assert.equal((await at('/x%7Cy')).route, '/x|y')],
  ]);
});

test('B17.2: static segments compare decoded text, so lowercase percent-encoding matches', async (t) => {
  const { at } = await mounted(t, ['/über'], '/');
  assert.equal((await at('/%c3%bcber')).route, '/über', 'decodes to the same path as /%C3%BCber');
});

test('B17.2: constraints test the decoded segment, so decoded values listed in the constraint match', async (t) => {
  // jasno.d.ts: ':tab(a|b)' gives the literal union 'a' | 'b' and "Values are decoded strings".
  const { at } = await mounted(t, ['/l/:lang(ru|日本)', '/s/:x(a b|c)', '/n/:n(\\d+)'], '/l/ru');
  await all([
    ['/l/日本', async () => assert.deepEqual((await at('/l/日本')).params, { lang: '日本' })],
    ['/s/a%20b', async () => assert.deepEqual((await at('/s/a%20b')).params, { x: 'a b' })],
    ['/n/%31%32', async () => assert.deepEqual((await at('/n/%31%32')).params, { n: '12' })],
  ]);
});

// ---------------------------------------------------------------- B17.14 href

test('B17.14 href encodes each param with encodeURIComponent(String(value)); numbers allowed', () => {
  const router = make(['/u/:id', '/t/:tab(a|b)', '/über/:x']);
  const cases: [unknown, string][] = [
    ['a b', 'a%20b'], ['a/b', 'a%2Fb'], ['?#%&=+', '%3F%23%25%26%3D%2B'], ['é', '%C3%A9'], ['✓', '%E2%9C%93'],
    ["it's (x)*~!", "it's%20(x)*~!"], [7, '7'], [0, '0'], [-1.5, '-1.5'], [1e21, '1e%2B21'],
  ];
  for (const [v, enc] of cases) assert.equal(router.href('/u/:id', { id: v as string }), `/u/${enc}`, String(v));
  assert.equal(router.href('/t/:tab(a|b)', { tab: 'b' }), '/t/b');
  assert.equal(router.href('/über/:x', { x: 'ü' }), '/über/%C3%BC', 'static segments are kept as written');
});

test('B17.14 href encodes + and * params per sub-segment, keeping "/"', () => {
  const router = make(['/d/:p+', '/o/:p*', '/m/:a/:p+']);
  assert.equal(router.href('/d/:p+', { p: 'a b/c?d/%' }), '/d/a%20b/c%3Fd/%25');
  assert.equal(router.href('/d/:p+', { p: 12 }), '/d/12');
  assert.equal(router.href('/o/:p*', { p: 'x/y#z' }), '/o/x/y%23z');
  assert.equal(router.href('/m/:a/:p+', { a: 'a/b', p: 'c/d' }), '/m/a%2Fb/c/d', 'a single param still encodes "/"');
});

test('B17.14 href drops empty optional segments and always returns an absolute path', () => {
  history.replaceState(null, '', '/deep/nested/page?q=1#h');
  const router = make(['/f/:a?/x', '/o/:p*', '/:x?', '/a/:b?/:c?', '/lang/:code?', '/u/:id']);
  assert.equal(router.href('/f/:a?/x'), '/f/x');
  assert.equal(router.href('/f/:a?/x', {}), '/f/x');
  assert.equal(router.href('/f/:a?/x', { a: '' }), '/f/x');
  assert.equal(router.href('/f/:a?/x', { a: undefined } as never), '/f/x'); // exactOptionalPropertyTypes forbids an explicit undefined
  assert.equal(router.href('/f/:a?/x', { a: 'z' }), '/f/z/x');
  assert.equal(router.href('/f/:a?/x', { a: '0' }), '/f/0/x', '"0" is not empty');
  assert.equal(router.href('/o/:p*', { p: '' }), '/o');
  assert.equal(router.href('/o/:p*'), '/o');
  assert.equal(router.href('/:x?'), '/');
  assert.equal(router.href('/lang/:code?'), '/lang');
  assert.equal(router.href('/a/:b?/:c?', { b: 'x' }), '/a/x');
  assert.equal(router.href('/u/:id', { id: 'rel' }), '/u/rel', 'not relative to the current location');
  history.replaceState(null, '', '/');
});

test('B17.14 (types): href accepts numbers for optional :x? and :x* params', () => {
  // ADR-21 (4) "href accepts numbers"; jasno.d.ts Router.href: "(numbers are fine)". Required :x and :x+ accept numbers,
  // the runtime accepts them everywhere; HrefParams maps an optional key's `string | undefined` to itself, so tsc reports
  // TS2322 "Type 'number' is not assignable to type 'string'" on the two optional calls below.
  const router = make(['/u/:id', '/e/:p+', '/f/:a?/x', '/d/:p*']);
  assert.equal(router.href('/u/:id', { id: 1 }), '/u/1');
  assert.equal(router.href('/e/:p+', { p: 1 }), '/e/1');
  assert.equal(router.href('/f/:a?/x', { a: 0 }), '/f/0/x');
  assert.equal(router.href('/d/:p*', { p: 2 }), '/d/2');
});

test('B17.14 href round-trips through navigation: the view receives the original values', async (t) => {
  const { router, at } = await mounted(t, ['/u/:id', '/d/:p+', '/o/:k/:p*'], '/u/start');
  const values = ['a b', 'a/b', 'a?b', 'a#b', '100%', 'a+b', 'é', '✓', "it's", '(x)', '*', '~', '%2F', ' lead', 'x.y', '日本'];
  for (const v of values) {
    assert.deepEqual(await at(router.href('/u/:id', { id: v })), { result: 'done', route: '/u/:id', params: { id: v } }, JSON.stringify(v));
  }
  for (const v of ['a/b', 'a b/c?d/e#f', '%/+/é', 'x']) {
    assert.deepEqual((await at(router.href('/d/:p+', { p: v }))).params, { p: v }, JSON.stringify(v));
    assert.deepEqual((await at(router.href('/o/:k/:p*', { k: 'k/1', p: v }))).params, { k: 'k/1', p: v }, JSON.stringify(v));
  }
  assert.deepEqual((await at(router.href('/o/:k/:p*', { k: 7 }))).params, { k: '7' });
});
