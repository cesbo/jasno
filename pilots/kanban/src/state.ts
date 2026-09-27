import { createRoot, resource, signal } from 'jasno';
import { createCard, deleteCard, listCards, saveCard } from '#api';
import type { Card, Column } from './api.ts';

export const cards = createRoot(() => resource({ debugName: 'cards', loader: ({ abortSignal }) => listCards(abortSignal) }));
/** The last failed write, shown in the app's status line. */
export const notice = signal('');

type Fields = Pick<Card, 'title' | 'column'>;
const confirmed = new Map<string, Fields>(); // last fields the server accepted, while requests of the card are queued
const queue = new Map<string, Promise<void>>(); // the last queued request per card
const timeout = (): AbortSignal => AbortSignal.timeout(10_000);

function show(id: string, fields: Fields): void {
  if (cards.hasValue()) cards.set(cards.value().map((c) => (c.id === id ? { ...c, title: fields.title, column: fields.column } : c)));
}

/** Requests of one card run one after another; last() tells a task whether it is still the newest. Tasks never reject. */
function enqueue(id: string, task: (last: () => boolean) => Promise<void>): Promise<void> {
  const run: Promise<void> = (queue.get(id) ?? Promise.resolve())
    .then(() => task(() => queue.get(id) === run))
    .finally(() => { if (queue.get(id) === run) { queue.delete(id); confirmed.delete(id); } });
  queue.set(id, run);
  return run;
}

/** Optimistic save. When the last queued save fails, show what the server last accepted; an earlier failure changes nothing. */
function save(id: string, change: Partial<Fields>): Promise<void> {
  const card = cards.hasValue() ? cards.value().find((c) => c.id === id) : undefined;
  if (!card) return Promise.resolve();
  const next: Card = { ...card, ...change };
  if (!confirmed.has(id)) confirmed.set(id, card);
  show(id, next);
  return enqueue(id, async (last) => {
    try {
      await saveCard(next, timeout());
      confirmed.set(id, next);
      if (last()) show(id, next);
    } catch {
      if (last()) { show(id, confirmed.get(id) ?? next); notice.set(`Not saved: “${next.title}”. Your change was undone.`); }
    }
  });
}

export const rename = (id: string, title: string): Promise<void> => save(id, { title });
export const move = (id: string, column: Column): Promise<void> => save(id, { column });

export function addCard(title: string, column: Column): Promise<void> {
  if (!cards.hasValue()) return Promise.resolve();
  const card: Card = { id: crypto.randomUUID(), title, column };
  cards.set([...cards.value(), card]);
  return enqueue(card.id, () => createCard(card, timeout()).then(() => {}, () => {
    if (cards.hasValue()) cards.set(cards.value().filter((c) => c.id !== card.id));
    notice.set(`Could not add “${title}”.`);
  }));
}

export function removeCard(id: string): Promise<void> {
  const list = cards.hasValue() ? cards.value() : [];
  const index = list.findIndex((c) => c.id === id);
  const card = list[index];
  if (!card) return Promise.resolve();
  cards.set(list.toSpliced(index, 1));
  return enqueue(id, () => deleteCard(id, timeout()).catch(() => {
    const back = { ...card, ...confirmed.get(id) };
    if (cards.hasValue()) cards.set(cards.value().toSpliced(index, 0, back));
    notice.set(`Could not delete “${back.title}”.`);
  }));
}
