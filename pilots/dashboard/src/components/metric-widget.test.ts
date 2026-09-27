import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, h } from 'jasno';
import { mountTest, settled } from 'jasno/testing';
import type { Metric } from '../api.ts';
import { pageVisible, pollMs } from '../state.ts';
import { MetricWidget } from './metric-widget.ts';

/** A loader whose requests the test settles by hand. */
function controlled() {
  const calls: { resolve: (m: Metric) => void; reject: (e: Error) => void }[] = [];
  const load = (_signal: AbortSignal) => new Promise<Metric>((resolve, reject) => { calls.push({ resolve, reject }); });
  const call = (i: number) => { const c = calls[i]; assert.ok(c, `request ${i + 1} was made`); return c; };
  return { calls, load, call };
}
const metric = (value: number): Metric => ({ value, history: [value - 2, value - 1, value] });

test('polls one request at a time, keeps the last value while refreshing, pauses while hidden', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  pollMs.set(2000);
  const api = controlled();
  const view = mountTest(t, () => MetricWidget({ id: 'cpu', label: 'CPU', unit: '%', load: api.load }));
  const section = view.root.querySelector('section')!;
  assert.equal(api.calls.length, 1);
  assert.match(section.textContent, /Loading CPU/);

  api.call(0).resolve(metric(40));
  await settled();
  assert.match(section.textContent, /40 %/);
  assert.ok(section.querySelector('polyline')!.getAttribute('points'));

  t.mock.timers.tick(1999);
  flush();
  assert.equal(api.calls.length, 1, 'not before the interval');
  t.mock.timers.tick(1);
  flush();
  assert.equal(api.calls.length, 2, 'refresh after the interval');
  assert.equal(section.getAttribute('aria-busy'), 'true');
  assert.match(section.textContent, /40 %/, 'last value stays while refreshing');

  t.mock.timers.tick(10_000);
  flush();
  assert.equal(api.calls.length, 2, 'a slow request is never stacked');

  api.call(1).resolve(metric(41));
  await settled();
  assert.match(section.textContent, /41 %/);

  pageVisible.set(false);
  flush();
  t.mock.timers.tick(10_000);
  flush();
  assert.equal(api.calls.length, 2, 'no polling while hidden');

  pageVisible.set(true);
  flush();
  t.mock.timers.tick(2000);
  flush();
  assert.equal(api.calls.length, 3, 'resumes when visible');
  api.call(2).resolve(metric(42));
  await settled();
});

test('a failing widget shows an error with Retry and leaves its neighbour working', async (t) => {
  const bad = controlled();
  const good = controlled();
  const view = mountTest(t, () => h.div(null,
    MetricWidget({ id: 'latency', label: 'Latency', unit: 'ms', load: bad.load }),
    MetricWidget({ id: 'cpu', label: 'CPU', unit: '%', load: good.load })));
  bad.call(0).reject(new Error('Upstream timeout (504)'));
  good.call(0).resolve(metric(40));
  await settled();

  const [latency, cpu] = view.root.querySelectorAll('section');
  assert.match(latency!.textContent, /Could not load Latency: Upstream timeout \(504\)/);
  assert.match(cpu!.textContent, /40 %/);
  const retry = latency!.querySelector<HTMLButtonElement>('button[aria-label="Retry Latency"]')!;
  retry.focus();
  retry.click();
  flush();
  assert.ok(document.activeElement === latency!.querySelector('[role="status"]'), 'focus moves to the status line');
  assert.equal(bad.calls.length, 2);

  bad.call(1).resolve(metric(180));
  await settled();
  assert.match(latency!.textContent, /180 ms/);
  assert.equal(latency!.querySelector('button'), null);
});

test('a failed refresh keeps the last value (stale) and stops polling until Retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  pollMs.set(2000);
  const api = controlled();
  const view = mountTest(t, () => MetricWidget({ id: 'cpu', label: 'CPU', unit: '%', load: api.load }));
  const section = view.root.querySelector('section')!;
  api.call(0).resolve(metric(40));
  await settled();
  t.mock.timers.tick(2000);
  flush();
  api.call(1).reject(new Error('HTTP 503'));
  await settled();

  assert.match(section.textContent, /40 %/);
  assert.ok(section.classList.contains('stale'));
  assert.match(section.textContent, /Could not load CPU: HTTP 503/);
  t.mock.timers.tick(10_000);
  flush();
  assert.equal(api.calls.length, 2, 'no polling while in error');

  section.querySelector('button')!.click();
  flush();
  assert.equal(api.calls.length, 3);
  api.call(2).resolve(metric(43));
  await settled();
  assert.ok(!section.classList.contains('stale'));
  assert.match(section.textContent, /43 %/);
});
