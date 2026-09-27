// In-memory backend for jasno dev, npm test and the e2e build (package.json "imports" #api, condition development).
import type * as Api from './api.ts';
import type { Person } from './api.ts';

const seed = (): Person[] => [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0001', notes: 'Prefers email. Working on the analytical engine notes.' },
  { id: '2', name: 'Grace Hopper', email: 'grace@example.com', phone: '+1 202 555 0102', notes: 'Ask about the compiler talk.' },
  { id: '3', name: 'Alan Turing', email: 'alan@example.com', phone: '+44 20 7946 0003', notes: '' },
  { id: '4', name: 'Katherine Johnson', email: 'katherine@example.com', phone: '+1 757 555 0104', notes: 'Orbital mechanics review on Friday.' },
];
let people = seed();

/** Test helper: restores the seed data. */
export function reset(): void { people = seed(); }

// Realistic latency that honours the abort signal. The id 'boom' simulates a server failure.
function delay<T>(ms: number, signal: AbortSignal, value: () => T): Promise<T> {
  return new Promise((ok, fail) => {
    signal.throwIfAborted();
    const t = setTimeout(() => { try { ok(value()); } catch (e) { fail(e); } }, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); fail(signal.reason); }, { once: true });
  });
}
const check = (id: string): void => { if (id === 'boom') throw new Error('Server error 500'); };

export const listPeople: typeof Api.listPeople = (signal) =>
  delay(150, signal, () => people.toSorted((a, b) => a.name.localeCompare(b.name)));

export const getPerson: typeof Api.getPerson = (id, signal) =>
  delay(150, signal, () => { check(id); return people.find((p) => p.id === id) ?? null; });

export const savePerson: typeof Api.savePerson = (person, signal) =>
  delay(400, signal, () => {
    check(person.id);
    const i = people.findIndex((p) => p.id === person.id);
    people = i < 0 ? [...people, person] : people.with(i, person);
    return person;
  });

export const deletePerson: typeof Api.deletePerson = (id, signal) =>
  delay(300, signal, () => { people = people.filter((p) => p.id !== id); });
