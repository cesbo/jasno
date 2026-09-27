import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, signal } from 'jasno';
import { mountTest } from 'jasno/testing';
import type { Service } from '../api.ts';
import { ServiceList } from './services.ts';

const svc = (id: string, name: string): Service => ({ id, name, health: 'up', version: '1.0.0', region: 'eu', owner: 'Ops' });
const SERVICES = [svc('api', 'Public API'), svc('auth', 'Auth'), svc('billing', 'Billing')];

test('selecting a service presses exactly its button and keeps focus on it', (t) => {
  const selected = signal<string | null>(null);
  const picks: string[] = [];
  const view = mountTest(t, () => ServiceList({ services: () => SERVICES, selected,
    onSelect: (id) => { picks.push(id); selected.set(id); } }));
  const buttons = [...view.root.querySelectorAll('button')];
  const pressed = () => buttons.map((b) => b.getAttribute('aria-pressed'));
  assert.deepEqual(pressed(), ['false', 'false', 'false']);

  buttons[1]!.focus();
  buttons[1]!.click();
  flush();
  assert.deepEqual(picks, ['auth']);
  assert.deepEqual(pressed(), ['false', 'true', 'false']);
  assert.ok(document.activeElement === buttons[1], 'focus stays on the pressed button');

  selected.set('billing');
  flush();
  assert.deepEqual(pressed(), ['false', 'false', 'true']);
});
