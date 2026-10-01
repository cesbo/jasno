// The production build (no development condition): codes the catalogue marks "dev + prod" throw there too, and
// @jasno/core/testing refuses to load. Each case runs in a child node without --conditions=development.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function prod(code: string): string {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const r = spawnSync(process.execPath, ['--import', './src/happy-dom.ts', '--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split('\n').at(-1)!;
}

const codeOf = `(e) => (e && e.diag ? e.diag.code : String(e))`;

test('the production build is the one under test: window.__JASNO__ is not installed', () => {
  assert.equal(prod(`import '@jasno/core'; console.log(typeof window.__JASNO__);`), 'undefined');
});

test('R-m4: FLUSH_REENTRANT in a derivation throws in the production build too', () => {
  assert.equal(prod(`
    import { computed, flush } from '@jasno/core';
    const c = computed(() => { flush(); return 1; });
    try { c(); console.log('no throw'); } catch (e) { console.log((${codeOf})(e)); }`), 'FLUSH_REENTRANT');
});

test('A29: ROUTE_SHADOWED throws in the production build too', () => {
  assert.equal(prod(`
    import { component, h } from '@jasno/core';
    import { createRouter, route } from '@jasno/core/router';
    const view = async () => ({ default: component(function V() { return h.h1(null, 'v'); }) });
    try {
      createRouter([route('/users/:id', { view }), route('/users/new', { view })], { error: () => h.p(null, 'e'), notFound: () => h.p(null, 'n') });
      console.log('no throw');
    } catch (e) { console.log((${codeOf})(e)); }`), 'ROUTE_SHADOWED');
});

test('TESTING_REQUIRES_DEV_BUILD: @jasno/core/testing through its default condition refuses to load', () => {
  assert.equal(prod(`
    try { await import('@jasno/core/testing'); console.log('loaded'); } catch (e) { console.log((${codeOf})(e)); }`), 'TESTING_REQUIRES_DEV_BUILD');
});
