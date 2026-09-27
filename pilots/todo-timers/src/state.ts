import { signal } from 'jasno';

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
  /** Time banked by earlier start/stop runs. */
  readonly elapsedMs: number;
  /** Date.now() when the running timer started; null while stopped. */
  readonly startedAt: number | null;
}

export type Filter = 'all' | 'active' | 'done';
export const FILTERS: readonly Filter[] = ['all', 'active', 'done'];

const KEY = 'todo-timers';

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Validates what localStorage holds: keeps well-formed todos with unique ids, drops the rest. */
export function parseTodos(raw: string | null): Todo[] {
  let data: unknown;
  try { data = JSON.parse(raw ?? '[]'); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: Todo[] = [];
  for (const v of data as unknown[]) {
    if (typeof v !== 'object' || v === null) continue;
    const { id, text, done, elapsedMs, startedAt } = v as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    if (typeof text !== 'string' || text.trim() === '' || typeof done !== 'boolean' || !isTime(elapsedMs)) continue;
    if (startedAt !== null && !isTime(startedAt)) continue;
    seen.add(id);
    out.push({ id, text: text.trim(), done, elapsedMs, startedAt });
  }
  return out;
}

function load(): Todo[] {
  try { return parseTodos(localStorage.getItem(KEY)); } catch { return []; }
}

export function save(list: readonly Todo[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked: keep working in memory */ }
}

export const todos = signal<readonly Todo[]>(load());

/** Total time of a todo at the clock reading now (never negative if now lags a fresh start). */
export const elapsedOf = (t: Todo, now: number): number =>
  t.elapsedMs + (t.startedAt === null ? 0 : Math.max(0, now - t.startedAt));

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${mm}:${ss}`;
}

const change = (id: string, fn: (t: Todo) => Todo): void =>
  todos.update((list) => list.map((t) => (t.id === id ? fn(t) : t)));

const stopped = (t: Todo): Todo =>
  t.startedAt === null ? t : { ...t, elapsedMs: elapsedOf(t, Date.now()), startedAt: null };

export function addTodo(text: string): void {
  todos.update((list) => [...list, { id: crypto.randomUUID(), text, done: false, elapsedMs: 0, startedAt: null }]);
}

export const renameTodo = (id: string, text: string): void => change(id, (t) => ({ ...t, text }));
export const removeTodo = (id: string): void => todos.update((list) => list.filter((t) => t.id !== id));
// Finishing a task stops its clock; reopening it leaves the clock stopped.
export const toggleDone = (id: string): void => change(id, (t) => ({ ...stopped(t), done: !t.done }));
export const startTimer = (id: string): void =>
  change(id, (t) => (t.startedAt === null ? { ...t, startedAt: Date.now() } : t));
export const stopTimer = (id: string): void => change(id, stopped);
