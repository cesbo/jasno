// Fixtures for changelog rows whose promised check had no test yet (the phase-1 criterion-4 audit, 2026-09-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot, effect, flush, h, show, signal } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import { capture } from '../helpers.ts';

test('U-DG8: update() in an effect that writes an observed signal reports EFFECT_WRITES_STATE, like set()', () => {
  const cap = capture();
  const a = signal(1), b = signal(0, { debugName: 'b' });
  const dispose = createRoot((d) => {
    effect(() => { b(); });
    effect(() => { const x = a(); b.update((n) => n + x); }, { debugName: 'bump' });
    return d;
  });
  flush();
  cap.stop();
  dispose();
  assert.deepEqual(cap.codes(), ['EFFECT_WRITES_STATE']);
  assert.match(cap.diags[0]!.message, /"bump".*"b"/);
});

test('RP-10: FOCUS_LOST is reported once per element, action, owner path and cause; a repeat counts', async (t) => {
  const on = signal(true, { debugName: 'on' });
  const v = mountTest(t, () => h.div(null, show(on, () => h.button({ type: 'button' }, 'x'))), { expect: ['FOCUS_LOST'] });
  for (let i = 0; i < 2; i++) {
    v.root.querySelector('button')!.focus();
    on.set(false);
    await settled();
    on.set(true);
    await settled();
  }
  const lost = v.diagnostics.filter((d) => d.code === 'FOCUS_LOST');
  assert.equal(lost.length, 1);
  assert.equal(lost[0]!.count, 2);
});

test('RP-18: jasno/testing/happy-dom focuses [autofocus] on showModal() and returns focus to the opener on close()', (t) => {
  const v = mountTest(t, () => {
    const opener = h.button({ type: 'button', onclick: () => dialog.showModal() }, 'Open');
    const dialog = h.dialog({ 'aria-label': 'Confirm' }, h.button({ type: 'button' }, 'Other'), h.button({ type: 'button', autofocus: true }, 'OK'));
    return h.div(null, opener, dialog);
  });
  const opener = v.root.querySelector('button')!;
  opener.focus();
  opener.click();
  assert.equal(document.activeElement?.textContent, 'OK');
  v.root.querySelector('dialog')!.close();
  assert.equal(document.activeElement, opener);
});

test('jasno/testing/happy-dom: close() returns focus before the close event, so onclose may move it; returnValue is kept (pilots kanban B1, contacts G2)', (t) => {
  const v = mountTest(t, () => {
    const opener = h.button({ type: 'button', onclick: () => dialog.showModal() }, 'Open');
    const heading = h.h2({ tabIndex: -1 }, 'Board');
    const dialog = h.dialog({ 'aria-label': 'Confirm', onclose: () => heading.focus() }, h.button({ type: 'button', autofocus: true }, 'OK'));
    return h.div(null, heading, opener, dialog);
  });
  const opener = v.root.querySelector('button')!;
  const dialog = v.root.querySelector('dialog')!;
  opener.focus();
  opener.click();
  dialog.close('yes');
  assert.ok(document.activeElement === v.root.querySelector('h2'), 'the close handler\'s focus move wins, as in browsers');
  assert.equal(dialog.returnValue, 'yes');
  dialog.showModal();
  dialog.close();
  assert.equal(dialog.returnValue, 'yes', 'close() without an argument keeps returnValue (HTML spec; Firefox and WebKit)');
});

test('V2-17, E8: tools/gen-elements.cjs regenerates the element region of jasno.elements.d.ts byte for byte', () => {
  const design = fileURLToPath(new URL('../../../design/', import.meta.url));
  const copy = join(mkdtempSync(join(tmpdir(), 'jasno-elements-')), 'jasno.elements.d.ts');
  copyFileSync(join(design, 'jasno.elements.d.ts'), copy);
  const r = spawnSync(process.execPath, [join(design, 'tools/gen-elements.cjs'), copy], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(copy, 'utf8'), readFileSync(join(design, 'jasno.elements.d.ts'), 'utf8'));
  rmSync(dirname(copy), { recursive: true });
});

test('jasno/testing/happy-dom: AbortSignal.timeout() does not keep node alive (pilots chat B1, contacts B2)', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const started = performance.now();
  const r = spawnSync(process.execPath, ['--import', './src/happy-dom.ts', '-e', 'AbortSignal.timeout(20_000)'], { cwd: root, encoding: 'utf8', timeout: 15_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(performance.now() - started < 10_000, 'the process exits without waiting for the timeout');
});
