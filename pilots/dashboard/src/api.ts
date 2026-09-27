export interface Metric { readonly value: number; readonly history: readonly number[] }
export type Health = 'up' | 'degraded' | 'down';
export interface Service {
  readonly id: string;
  readonly name: string;
  readonly health: Health;
  readonly version: string;
  readonly region: string;
  readonly owner: string;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export async function getMetric(id: string, signal: AbortSignal): Promise<Metric> {
  const m = await getJson(`/api/metrics/${encodeURIComponent(id)}`, signal);
  if (!isRecord(m) || typeof m.value !== 'number' || !Array.isArray(m.history) || !m.history.every((n) => typeof n === 'number'))
    throw new Error(`Bad metric payload for ${id}`);
  return { value: m.value, history: m.history };
}

const HEALTH: readonly string[] = ['up', 'degraded', 'down'];
const isService = (s: unknown): s is Service => isRecord(s)
  && ['id', 'name', 'version', 'region', 'owner'].every((k) => typeof s[k] === 'string')
  && typeof s.health === 'string' && HEALTH.includes(s.health);

export async function listServices(signal: AbortSignal): Promise<readonly Service[]> {
  const list = await getJson('/api/services', signal);
  if (!Array.isArray(list) || !list.every(isService)) throw new Error('Bad services payload');
  return list;
}
