// Dev/test backend: slow responses, deterministic failures (the "latency" metric fails its 1st request and every 6th).
import type * as Api from './api.ts';

const delay = (ms: number, signal: AbortSignal) => new Promise<void>((ok, fail) => {
  if (signal.aborted) return fail(signal.reason);
  const t = setTimeout(ok, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); fail(signal.reason); }, { once: true });
});
const slow = (signal: AbortSignal) => delay(300 + Math.random() * 900, signal);

const BASE: Record<string, number> = { cpu: 40, memory: 62, rps: 1200, latency: 180 };
const history = new Map<string, number[]>();
const calls = new Map<string, number>();

export const getMetric: typeof Api.getMetric = async (id, signal) => {
  const n = (calls.get(id) ?? 0) + 1;
  calls.set(id, n);
  await slow(signal);
  if (id === 'latency' && n % 6 === 1) throw new Error('Upstream timeout (504)');
  const base = BASE[id] ?? 50;
  const walk = (from: number) => Math.max(0, Math.round(from + (Math.random() - 0.5) * base * 0.2));
  let next = history.get(id) ?? [];
  do next = [...next, walk(next.at(-1) ?? base)].slice(-20); while (next.length < 20); // the API returns a 20-sample window
  history.set(id, next);
  return { value: next.at(-1) ?? base, history: next };
};

const SERVICES: readonly Api.Service[] = [
  { id: 'api', name: 'Public API', health: 'up', version: '4.12.0', region: 'eu-west-1', owner: 'Platform' },
  { id: 'auth', name: 'Auth', health: 'up', version: '2.3.1', region: 'eu-west-1', owner: 'Identity' },
  { id: 'billing', name: 'Billing', health: 'degraded', version: '1.9.4', region: 'us-east-1', owner: 'Payments' },
  { id: 'search', name: 'Search', health: 'up', version: '7.0.0', region: 'us-east-1', owner: 'Discovery' },
  { id: 'mailer', name: 'Mailer', health: 'down', version: '0.8.2', region: 'eu-central-1', owner: 'Growth' },
];

export const listServices: typeof Api.listServices = async (signal) => {
  await slow(signal);
  return SERVICES;
};
