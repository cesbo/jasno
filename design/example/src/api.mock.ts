// Development stand-in for api.ts: package.json "imports" maps '#api' here under the "development" condition, so
// jasno dev and npm test run without a backend, while jasno dist ships api.ts. Same exports, typed by the real module.
import type * as Api from './api.ts';
import type { Note, User } from './api.ts';

const users: readonly User[] = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', team: 'Engines' },
  { id: '2', name: 'Alan Turing', email: 'alan@example.com', team: 'Codebreaking' },
  { id: '3', name: 'Grace Hopper', email: 'grace@example.com', team: 'Compilers' },
];
let notes: readonly Note[] = [{ id: 'n1', userId: '1', text: 'Send the Bernoulli table', createdAt: '2026-09-01T10:00:00Z' }];

// Settles after 300 ms like a request, so loading states are visible; rejects with the reason when aborted.
function later<T>(value: T, abortSignal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), 300);
    abortSignal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortSignal.reason); });
  });
}

export const listUsers: typeof Api.listUsers = (abortSignal) => later([...users], abortSignal);

export const getUser: typeof Api.getUser = async (id, abortSignal) => {
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error(`GET /api/users/${id} failed with 404`);
  return later(user, abortSignal);
};

export const listNotes: typeof Api.listNotes = (userId, abortSignal) =>
  later(notes.filter((n) => n.userId === userId), abortSignal);

export const addNote: typeof Api.addNote = async (userId, text) => {
  notes = [...notes, { id: crypto.randomUUID(), userId, text, createdAt: new Date().toISOString() }];
  await later(undefined);
};
