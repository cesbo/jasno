// In-memory stand-in for api.ts (jasno dev and npm test get it through "#api"): slow, and failing on demand.
import type * as Api from './api.ts';
import type { Card } from './api.ts';

const seed: readonly Card[] = [
  { id: 'c1', title: 'Write the spec', column: 'todo' },
  { id: 'c2', title: 'Sketch the board', column: 'todo' },
  { id: 'c3', title: 'Build the API', column: 'doing' },
  { id: 'c4', title: 'Set up the repo', column: 'done' },
];
let db: Card[] = [...seed];

/** Knobs: delay range in ms, random failure rate for writes, and scripted outcomes consumed one per write. */
export const mock = { minDelay: 300, maxDelay: 1200, failRate: 0.2, outcomes: [] as ('ok' | 'fail')[] };
export function resetMock(): void {
  db = [...seed];
  Object.assign(mock, { minDelay: 1, maxDelay: 5, failRate: 0, outcomes: [] });
}
// Playwright turns failures off with window.kanbanMock.failRate = 0.
(globalThis as { kanbanMock?: typeof mock }).kanbanMock = mock;

function reply<T>(abortSignal: AbortSignal, write: boolean, answer: () => T): Promise<T> {
  const fail = write && (mock.outcomes.shift() ?? (Math.random() < mock.failRate ? 'fail' : 'ok')) === 'fail';
  const ms = mock.minDelay + Math.random() * (mock.maxDelay - mock.minDelay);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { if (fail) throw new Error('Mock API: 503 Service Unavailable'); resolve(answer()); } catch (e) { reject(e); }
    }, ms);
    abortSignal.addEventListener('abort', () => { clearTimeout(timer); reject(abortSignal.reason); }, { once: true });
  });
}

function find(id: string): number {
  const i = db.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Mock API: 404 Not Found');
  return i;
}

export const listCards: typeof Api.listCards = (abortSignal) => reply(abortSignal, false, () => [...db]);
export const createCard: typeof Api.createCard = (card, abortSignal) => reply(abortSignal, true, () => {
  if (!db.some((c) => c.id === card.id)) db = [...db, card];
  return card;
});
export const saveCard: typeof Api.saveCard = (card, abortSignal) => reply(abortSignal, true, () => {
  db = db.with(find(card.id), card);
  return card;
});
export const deleteCard: typeof Api.deleteCard = (id, abortSignal) => reply(abortSignal, true, () => {
  db = db.toSpliced(find(id), 1);
});
